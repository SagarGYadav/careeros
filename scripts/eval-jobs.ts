// JobExtractor evaluation (SPEC §8.6, §12.6): runs the extractor with a real AI provider on the 10 fictional
// postings in evals/fit/cases.ts, applies the same code checks as the app, and scores requirement recall (≥ 90%)
// and importance accuracy (≥ 85%) against the expected requirements.
//
//   npm run eval:jobs                         Gemini (fast tier: Flash-Lite)
//   npm run eval:jobs -- --provider=groq      another configured provider
//   npm run eval:jobs -- --only=rohan-go-backend,sneha-flutter
//
// No database needed: the skill catalogue and role families come from the seed data. Writes
// test-results/eval-jobs.json (git-ignored).
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { buildAiProviders } from "@/lib/ai/providers";
import { createAiRunner } from "@/lib/ai/runner";
import { FIT_TARGETS, rate, scoreJobExtraction, type ExtractionEval, type Ratio } from "@/lib/fit-report/eval";
import { finalizeRequirements } from "@/lib/jobs/requirements";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { buildSkillIndex } from "@/lib/skills/normalize";
import { extractJobWithAi } from "@/server/ai/job-extractor";
import { GOLDEN_CASES } from "../evals/fit/cases";
import { ROLE_FAMILIES } from "../prisma/seed/role-families";
import { SKILLS } from "../prisma/seed/skills";

const MAX_ATTEMPTS = 4;
/** A little longer than the chain's one-minute rest after a 503. */
const WAIT_MS = 70_000;

async function main() {
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
  // Only the chosen provider, with its own state: a silent fallback would measure the wrong model.
  const runner = createAiRunner({
    getProviders: async () => ({ providers: [provider], disabled: new Set() }),
    store: new MemoryProviderStore(),
    // Print failed requests (never content), so "busy" can be told apart from invalid answers or a used-up quota.
    log: async (entry) => {
      if (entry.status !== "ok")
        console.log(`      ${entry.workflow}: ${entry.status}${entry.errorKind ? ` (${entry.errorKind})` : ""}`);
    },
  });
  const catalogue = SKILLS.map((s) => ({ id: s.slug, slug: s.slug, name: s.name, aliases: s.aliases ?? [] }));
  const index = buildSkillIndex(catalogue);
  const families = ROLE_FAMILIES.map((f) => ({ slug: f.slug, name: f.name, titleVariants: f.titleVariants }));

  console.log(`JobExtractor eval with ${provider.label} (${provider.models.fast})\n`);
  const rows: { id: string; seconds: number; result: ExtractionEval; dropped: string[] }[] = [];
  const notMeasured: string[] = [];
  for (const c of GOLDEN_CASES.filter((g) => !only || only.includes(g.id))) {
    let extraction: Awaited<ReturnType<typeof extractJobWithAi>> | null = null;
    let started = Date.now();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      started = Date.now();
      const result = await extractJobWithAi(runner, {
        text: c.job.description,
        title: c.job.title,
        company: c.job.company,
        skills: catalogue,
        families,
      });
      if (result.mode === "ai") {
        extraction = result;
        break;
      }
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ${c.id.padEnd(26)} ${provider.label} busy; waiting ${WAIT_MS / 1000} s (attempt ${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      }
    }
    if (!extraction) {
      console.log(`  ${c.id.padEnd(26)} not measured: ${provider.label} stayed unavailable`);
      notMeasured.push(c.id);
      continue;
    }
    const { requirements, dropped } = finalizeRequirements(
      extraction.extraction.requirements,
      c.job.description,
      catalogue,
      index,
    );
    const result = scoreJobExtraction(c.requirements, requirements);
    rows.push({ id: c.id, seconds: Math.round((Date.now() - started) / 100) / 10, result, dropped });
    console.log(
      `  ${c.id.padEnd(26)} ${String(rows.at(-1)!.seconds).padStart(5)}s  recall ${result.recall.correct}/${result.recall.total}  importance ${result.importance.correct}/${result.importance.total}` +
        (result.missed.length ? `\n      missed: ${result.missed.join("; ")}` : "") +
        (result.wrongImportance.length ? `\n      importance: ${result.wrongImportance.join("; ")}` : "") +
        (dropped.length ? `\n      dropped (not found in the posting): ${dropped.join("; ")}` : ""),
    );
  }

  const sum = (pick: (r: ExtractionEval) => Ratio) =>
    rows.reduce(
      (acc, r) => ({ correct: acc.correct + pick(r.result).correct, total: acc.total + pick(r.result).total }),
      {
        correct: 0,
        total: 0,
      },
    );
  const recall = sum((r) => r.recall);
  const importance = sum((r) => r.importance);
  const pct = (r: Ratio) => `${(rate(r) * 100).toFixed(1)}% (${r.correct}/${r.total})`;
  console.log(`\nRequirement recall    ${pct(recall)}   target ≥ ${FIT_TARGETS.requirementRecall * 100}%`);
  console.log(`Importance accuracy   ${pct(importance)}   target ≥ ${FIT_TARGETS.importanceAccuracy * 100}%`);
  if (notMeasured.length) console.log(`Not measured: ${notMeasured.join(", ")}`);
  const met = rate(recall) >= FIT_TARGETS.requirementRecall && rate(importance) >= FIT_TARGETS.importanceAccuracy;
  console.log(met && !notMeasured.length ? "\nTargets met." : "\nTargets not met yet.");

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/eval-jobs.json",
    JSON.stringify(
      {
        provider: provider.name,
        model: provider.models.fast,
        at: new Date().toISOString(),
        recall,
        importance,
        rows,
        notMeasured,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
