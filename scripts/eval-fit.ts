// Fit Report evaluation (SPEC §8.6, §12.6): the whole pipeline on the 10 golden cases in evals/fit/cases.ts, with a
// real AI provider for JobExtractor and FitAnalyst. Scores required-requirement coverage (100%), citation validity
// (100%), checklist hit rate (≥ 80%) and banned generic phrases (0).
//
//   npm run eval:fit                          Gemini (job reading on Flash-Lite, the report on Flash)
//   npm run eval:fit -- --provider=groq
//   npm run eval:fit -- --only=ananya-payments-frontend
//
// Runs against the TEST database (DATABASE_URL_TEST) with fictional users that are deleted afterwards. CVs are
// read with the mock AI (the fixtures parse exactly), so the quota goes to what is measured. Writes
// test-results/eval-fit.json (git-ignored).
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

if (!process.env.DATABASE_URL_TEST) {
  console.error("DATABASE_URL_TEST is not set; the eval runs on the test database only.");
  process.exit(1);
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
// The app's own chain (used for reading the CVs) is the mock; the measured steps get the chosen provider.
process.env.AI_PROVIDERS = "mock";

const MAX_ATTEMPTS = 4;
const WAIT_MS = 70_000;
const EMAIL_DOMAIN = "@eval-fit.careeros.test";

async function main() {
  const { buildAiProviders } = await import("@/lib/ai/providers");
  const { createAiRunner } = await import("@/lib/ai/runner");
  const { MemoryProviderStore } = await import("@/lib/providers/memory-store");
  const evalLib = await import("@/lib/fit-report/eval");
  const { db } = await import("@/server/db");
  const { savePreferences } = await import("@/server/repositories/profile");
  const { processCvUpload } = await import("@/server/services/cv-pipeline");
  const { confirmResume } = await import("@/server/services/profile");
  const { addCustomRole } = await import("@/server/services/target-roles");
  const { addJob } = await import("@/server/services/add-job");
  const { generateFitReport } = await import("@/server/services/fit-report");
  const { GOLDEN_CASES } = await import("../evals/fit/cases");
  const { CV_FIXTURES } = await import("../fixtures/cv/personas");

  const providerName = process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1] ?? "gemini";
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.split("=")[1]
    ?.split(",");
  const provider = buildAiProviders({ ...process.env, AI_PROVIDERS: providerName }).find(
    (p) => p.name === providerName,
  );
  // --provider=mock is a dry run of the harness: it measures the deterministic fallback, not a model.
  if (!provider?.configured || (provider.isMock && providerName !== "mock")) {
    console.error(`Provider "${providerName}" isn't configured. Add its API key to .env.`);
    process.exit(1);
  }
  const runner = createAiRunner({
    getProviders: async () => ({ providers: [provider], disabled: new Set() }),
    store: new MemoryProviderStore(),
    // Print failed requests (never content), so "busy" can be told apart from invalid answers or a used-up quota.
    log: async (entry) => {
      if (entry.status !== "ok")
        console.log(`      ${entry.workflow}: ${entry.status}${entry.errorKind ? ` (${entry.errorKind})` : ""}`);
    },
  });

  type Row = {
    id: string;
    seconds: number;
    score: number;
    recommendation: string;
    passed: boolean;
    repaired: boolean;
    report: ReturnType<typeof evalLib.scoreReport>;
    checklist: { correct: number; total: number };
    misses: string[];
    issues: string[];
    /** What the report said, for reading misses afterwards. */
    written: unknown;
  };
  const rows: Row[] = [];
  const notMeasured: string[] = [];
  console.log(
    `Fit Report eval with ${provider.label} (job reading: ${provider.models.fast}, report: ${provider.models.strong})\n`,
  );

  try {
    const runCase = async (c: (typeof GOLDEN_CASES)[number]) => {
      const fixture = CV_FIXTURES.find((f) => f.id === c.cv)!;
      const userId = randomUUID();
      await db.user.create({ data: { id: userId, name: "Eval User", email: `${c.id}-${userId}${EMAIL_DOMAIN}` } });
      const bytes = new Uint8Array(await readFile(`fixtures/cv/${fixture.id}.${fixture.format}`));
      const { resumeId, draft } = await processCvUpload(userId, { fileName: `${fixture.id}.${fixture.format}`, bytes });
      await confirmResume(userId, resumeId, draft);
      await savePreferences(userId, {
        currentCtc: null,
        expectedCtcMin: c.preferences.expectedCtcLpa * 100_000,
        expectedCtcMax: null,
        noticePeriodDays: c.preferences.noticePeriodDays,
        preferredLocations: c.preferences.locations,
        workModes: c.preferences.workModes,
        openToRelocate: false,
        dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
      });
      await addCustomRole(userId, c.targetRole);
      const { jobId } = await addJob(userId, { ...c.job, applyUrl: "", origin: "paste" });

      // Only answers from the chosen provider count: when it was busy and the no-AI fallback answered, wait and
      // write the report again from scratch.
      let view: Awaited<ReturnType<typeof generateFitReport>> | null = null;
      let started = Date.now();
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        started = Date.now();
        const result = await generateFitReport(userId, jobId, { runner });
        if (result.report.mode === "ai" && result.analysis.extractionMode === "ai") {
          view = result;
          break;
        }
        await db.jobAnalysis.deleteMany({ where: { userId, jobId } });
        if (attempt < MAX_ATTEMPTS) {
          console.log(`  ${c.id.padEnd(26)} ${provider.label} busy; waiting ${WAIT_MS / 1000} s (attempt ${attempt})`);
          await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
        }
      }
      if (!view) {
        console.log(`  ${c.id.padEnd(26)} not measured: ${provider.label} stayed unavailable`);
        notMeasured.push(c.id);
        return;
      }

      const { analysis, report, validation } = view;
      const code = new Map(analysis.score.requirements.map((r) => [r.reqId, r]));
      const ai = new Map(report.requirements.map((r) => [r.reqId, r]));
      const statusOf = (reqId: string) => {
        const fromCode = code.get(reqId);
        return fromCode && fromCode.status !== "unscored" ? fromCode.status : (ai.get(reqId)?.status ?? "unscored");
      };
      const ctx = {
        report,
        requirements: analysis.requirements,
        statusOf,
        blockers: analysis.score.blockers.map((b) => b.kind),
        recommendation: analysis.score.recommendation,
      };
      const misses = c.checklist
        .filter((item) => !evalLib.checkItem(item, ctx))
        .map((item) => `${item.id}: ${item.expect}`);
      const required = analysis.requirements.filter((r) => r.importance === "required").map((r) => r.reqId);
      rows.push({
        id: c.id,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        score: analysis.score.total,
        recommendation: analysis.score.recommendation,
        passed: validation.passed,
        repaired: validation.repaired,
        report: evalLib.scoreReport(report, required, validation.issues),
        checklist: { correct: c.checklist.length - misses.length, total: c.checklist.length },
        misses,
        issues: validation.issues.map((i) => `${i.path}: ${i.message}`),
        written: { report: { ...report, stats: undefined, matches: undefined }, requirements: analysis.requirements },
      });
      const row = rows.at(-1)!;
      console.log(
        `  ${c.id.padEnd(26)} ${String(row.seconds).padStart(5)}s  Fit ${row.score} ${row.recommendation.padEnd(12)} ` +
          `checks ${row.passed ? "passed" : "failed"}${row.repaired ? " after repair" : ""}  checklist ${row.checklist.correct}/${row.checklist.total}` +
          (misses.length ? `\n      missed: ${misses.join(" | ")}` : "") +
          (row.issues.length ? `\n      unverified: ${row.issues.join(" | ")}` : ""),
      );
    };
    for (const c of GOLDEN_CASES.filter((g) => !only || only.includes(g.id))) {
      // A database hiccup (Neon waking up) shouldn't cost a measurement: try the case once more.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await runCase(c);
          break;
        } catch (error) {
          const message = error instanceof Error ? error.message.trim().split(/\r?\n/).at(-1) : String(error);
          console.log(`  ${c.id.padEnd(26)} error: ${message}`);
          if (attempt === 2) notMeasured.push(c.id);
        }
      }
    }
  } finally {
    await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  }

  const sum = (pick: (r: Row) => { correct: number; total: number }) =>
    rows.reduce((acc, r) => ({ correct: acc.correct + pick(r).correct, total: acc.total + pick(r).total }), {
      correct: 0,
      total: 0,
    });
  const coverage = sum((r) => r.report.requiredCoverage);
  const citations = sum((r) => r.report.citationValidity);
  const checklist = sum((r) => r.checklist);
  const banned = rows.reduce((n, r) => n + r.report.bannedPhrases, 0);
  const pct = (r: { correct: number; total: number }) =>
    `${(evalLib.rate(r) * 100).toFixed(1)}% (${r.correct}/${r.total})`;
  const t = evalLib.FIT_TARGETS;
  console.log(`\nRequired-requirement coverage  ${pct(coverage)}   target 100%`);
  console.log(`Citation validity              ${pct(citations)}   target 100%`);
  console.log(`Checklist hit rate             ${pct(checklist)}   target ≥ ${t.checklistHitRate * 100}%`);
  console.log(`Banned generic phrases         ${banned}   target 0`);
  console.log(
    `Reports passing every check    ${rows.filter((r) => r.passed).length}/${rows.length} (${rows.filter((r) => r.repaired).length} after one repair)`,
  );
  if (notMeasured.length) console.log(`Not measured: ${notMeasured.join(", ")}`);
  const met =
    evalLib.rate(coverage) >= t.requiredCoverage &&
    evalLib.rate(citations) >= t.citationValidity &&
    evalLib.rate(checklist) >= t.checklistHitRate &&
    banned <= t.bannedPhrases;
  console.log(met && !notMeasured.length ? "\nTargets met." : "\nTargets not met yet.");

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/eval-fit.json",
    JSON.stringify(
      {
        provider: provider.name,
        models: provider.models,
        at: new Date().toISOString(),
        coverage,
        citations,
        checklist,
        banned,
        rows,
        notMeasured,
      },
      null,
      2,
    ),
  );
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
