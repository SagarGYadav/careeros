// ResumeParser evaluation (SPEC §8.6, §9.4): runs the full CV pipeline with a real AI provider on the six
// fictional fixtures and scores the result against their known answers.
//
//   npm run eval:resume                      Gemini (the targets are defined for Gemini)
//   npm run eval:resume -- --provider=groq   any configured provider, to compare backups
//   npm run eval:resume -- --only=arjun-linked-text   one or more CVs (comma-separated)
//
// Uses the free tier: one request per CV, plus one re-read if a section looks incomplete. Answers are not
// cached, so every run is a fresh measurement. Writes test-results/eval-resume.json (git-ignored).
import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildAiProviders } from "@/lib/ai/providers";
import { createAiRunner } from "@/lib/ai/runner";
import { analyseCv, type CvParseFn } from "@/lib/cv/analyse";
import {
  EXTRACTION_TARGETS,
  missedTargets,
  rate,
  scoreExtraction,
  type ExpectedCv,
  type ExtractionScore,
  type Ratio,
} from "@/lib/cv/score";
import { createResumeParser } from "@/server/ai/resume-parser";
import { db } from "@/server/db";
import { logAiRequest } from "@/server/repositories/ai-records";
import { prismaProviderStore } from "@/server/repositories/provider-state";
import { CV_FIXTURES } from "../fixtures/cv/personas";

const MAX_ATTEMPTS = 4;
/** A little longer than the chain's one-minute rest after a 503. */
const WAIT_MS = 70_000;

type Row = { id: string; seconds: number; mode: string; reread: string; score: ExtractionScore; missed: string[] };

async function main() {
  const providerName = process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1] ?? "gemini";

  const provider = buildAiProviders({ ...process.env, AI_PROVIDERS: providerName }).find(
    (p) => p.name === providerName,
  );
  if (!provider?.configured || provider.isMock) {
    console.error(`Provider "${providerName}" isn't configured. Add its API key to .env.`);
    process.exit(1);
  }

  // Only the chosen provider: a silent fallback to a backup would measure the wrong model.
  const runner = createAiRunner({
    getProviders: async () => ({ providers: [provider], disabled: new Set() }),
    store: prismaProviderStore,
    log: logAiRequest,
  });
  const parse: CvParseFn = createResumeParser(runner);

  const rows: Row[] = [];
  const notMeasured: string[] = [];

  console.log(`ResumeParser eval with ${provider.label} (${provider.models.strong})\n`);
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.split("=")[1]
    ?.split(",");
  for (const cv of CV_FIXTURES.filter((c) => !only || only.includes(c.id))) {
    const bytes = new Uint8Array(await readFile(`fixtures/cv/${cv.id}.${cv.format}`));
    const expected = JSON.parse(await readFile(`fixtures/cv/${cv.id}.expected.json`, "utf8")) as ExpectedCv;
    // Only answers from the chosen provider count. When it is busy (503) the chain rests it for a minute and the
    // pipeline falls back to the deterministic reader, so wait and try again instead of scoring that.
    let analysis: Awaited<ReturnType<typeof analyseCv>> | null = null;
    let started = Date.now();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      started = Date.now();
      const result = await analyseCv(
        { bytes, kind: cv.format, fileName: `${cv.id}.${cv.format}` },
        { parse, now: new Date() },
      );
      if (result.parse.mode === "ai") {
        analysis = result;
        break;
      }
      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ${cv.id.padEnd(22)} ${provider.label} busy; waiting ${WAIT_MS / 1000} s (attempt ${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      }
    }
    if (!analysis) {
      console.log(`  ${cv.id.padEnd(22)} not measured: ${provider.label} stayed unavailable`);
      notMeasured.push(cv.id);
      continue;
    }
    const score = scoreExtraction(expected, analysis.draft, analysis.report);
    const second = analysis.report.completeness.secondPass;
    rows.push({
      id: cv.id,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      mode: analysis.parse.mode,
      reread: second.requested.length ? `${second.requested.join("+")}${second.failed ? " (failed)" : ""}` : "-",
      score,
      missed: missedTargets(score),
    });
    console.log(`  ${cv.id.padEnd(22)} ${rows.at(-1)!.seconds}s ${rows.at(-1)!.missed.length ? "below target" : "ok"}`);
  }

  const sum = (pick: (s: ExtractionScore) => Ratio): Ratio =>
    rows.reduce(
      (acc, r) => ({ correct: acc.correct + pick(r.score).correct, total: acc.total + pick(r.score).total }),
      {
        correct: 0,
        total: 0,
      },
    );
  const pct = (r: Ratio) => `${(rate(r) * 100).toFixed(1)}% (${r.correct}/${r.total})`;

  const totals = {
    contact: sum((s) => s.contact),
    experienceFound: sum((s) => s.experienceFound),
    experienceFields: sum((s) => s.experienceFields),
    bulletsCaptured: sum((s) => s.bulletsCaptured),
    skillRecall: sum((s) => s.skillRecall),
    skillPrecision: sum((s) => s.skillPrecision),
    educationFields: sum((s) => s.educationFields),
    certifications: sum((s) => s.certifications),
  };
  const invented = rows.reduce((n, r) => n + r.score.bulletsInvented, 0);

  console.log("\nPer CV");
  console.log(
    "  CV                     mode   secs  re-read      contact  roles  fields  bullets  invented  skillR  skillP  edu   certs",
  );
  for (const r of rows) {
    const s = r.score;
    const cell = (x: Ratio, w = 7) => `${x.correct}/${x.total}`.padEnd(w);
    console.log(
      `  ${r.id.padEnd(22)} ${r.mode.padEnd(6)} ${String(r.seconds).padEnd(5)} ${r.reread.padEnd(12)} ${cell(s.contact, 8)} ${cell(s.experienceFound, 6)} ${cell(s.experienceFields)} ${cell(s.bulletsCaptured, 8)} ${String(s.bulletsInvented).padEnd(9)} ${cell(s.skillRecall)} ${cell(s.skillPrecision)} ${cell(s.educationFields, 5)} ${cell(s.certifications, 5)}`,
    );
  }

  console.log("\nAgainst SPEC §9.4 targets (all six CVs together)");
  let pass = invented === 0 && notMeasured.length === 0;
  if (notMeasured.length) console.log(`  FAIL  not measured: ${notMeasured.join(", ")}`);
  for (const [key, target] of Object.entries(EXTRACTION_TARGETS)) {
    const value = totals[key as keyof typeof totals];
    const ok = rate(value) >= target;
    pass &&= ok;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${key.padEnd(17)} ${pct(value).padEnd(18)} target ${target * 100}%`);
  }
  console.log(`  ${invented === 0 ? "PASS" : "FAIL"}  bulletsInvented   ${invented}                  target 0`);

  const misses = rows.filter((r) => r.score.misses.length);
  if (misses.length) {
    console.log("\nMisses");
    for (const r of misses) for (const m of r.score.misses) console.log(`  ${r.id}: ${m}`);
  }

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/eval-resume.json",
    `${JSON.stringify({ provider: provider.name, model: provider.models.strong, at: new Date().toISOString(), totals, invented, rows }, null, 2)}\n`,
  );
  console.log(`\n${pass ? "All targets met." : "Some targets missed."} Details: test-results/eval-resume.json`);
  await db.$disconnect();
  return pass;
}

main().then(
  (pass) => process.exit(pass ? 0 : 1),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
