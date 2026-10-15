// Live acceptance run for Phase 3 (ROADMAP): one full search with the real job-search and embedding chains from
// .env, for a fictional user built from a fixture CV, with Adzuna forced to answer 429 so the chain must fail over.
//
//   npm run search:live               Adzuna forced to fail (the acceptance run)
//   npm run search:live -- --no-fail  every provider answers normally
//   npm run search:live -- --deep     also deep search: discover and read company career sites (needs web-search keys)
//
// AI runs on the mock (the CV is a fixture), so no AI quota is used. One role in one city keeps the run to a few
// requests of each free quota. Prints counts and public job titles only; the fictional user is deleted afterwards.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

process.env.AI_PROVIDERS = "mock";
const forceFail = !process.argv.includes("--no-fail");
// --deep: also discover and read company career sites (SPEC §11), with the real web-search chain from .env.
const deep = process.argv.includes("--deep");
if (deep) process.env.DEEP_SEARCH_ENABLED = "true";

// Answer every Adzuna request with "429 Too Many Requests" (rest 60 s), as Adzuna does when its limit is reached.
const realFetch = globalThis.fetch;
let forced = 0;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (forceFail && url.startsWith("https://api.adzuna.com/")) {
    forced++;
    return new Response('{"exception":"TOO_MANY_REQUESTS"}', {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    });
  }
  return realFetch(input, init);
};

async function main() {
  // Imported after the environment is set, so the chains read AI_PROVIDERS=mock.
  const { db } = await import("@/server/db");
  const { processCvUpload } = await import("@/server/services/cv-pipeline");
  const { confirmResume } = await import("@/server/services/profile");
  const { savePreferences } = await import("@/server/repositories/profile");
  const { addCustomRole } = await import("@/server/services/target-roles");
  const { advanceSearchRun, startSearchRun } = await import("@/server/services/search-runs");
  const { getFeed } = await import("@/server/services/feed");

  const user = await db.user.create({
    data: { id: randomUUID(), name: "Live Check", email: `live-check-${Date.now()}@search-live.careeros.test` },
  });
  try {
    const bytes = new Uint8Array(await readFile("fixtures/cv/ananya-single-column.pdf"));
    const { resumeId, draft } = await processCvUpload(user.id, { fileName: "ananya.pdf", bytes });
    await confirmResume(user.id, resumeId, draft);
    await addCustomRole(user.id, "React Developer");
    await savePreferences(user.id, {
      currentCtc: null,
      expectedCtcMin: 1_800_000,
      expectedCtcMax: null,
      noticePeriodDays: 30,
      preferredLocations: ["Bengaluru"],
      workModes: ["hybrid", "remote"],
      openToRelocate: false,
      dealbreakers: { bond: false, nightShift: false, contractToHire: true, maxWfoDaysPerWeek: null },
    });

    const started = Date.now();
    if (deep) {
      const { loadWebSearchProviders } = await import("@/server/websearch/runner");
      const { providers } = await loadWebSearchProviders();
      if (!providers.some((p) => p.configured && !p.isMock)) {
        console.log("--deep needs a real web-search provider: set WEB_SEARCH_PROVIDERS and its key in .env.");
        return;
      }
    }
    let progress = await startSearchRun(user.id);
    let calls = 1;
    while (progress.status === "running") {
      progress = await advanceSearchRun(user.id, progress.runId);
      calls++;
      console.log(
        `  ${progress.stage.padEnd(6)} queries ${progress.queriesDone}/${progress.queriesTotal} · found ${progress.found} · embedded ${progress.embedded} · ranked ${progress.ranked}`,
      );
    }
    const run = await db.jobSearchRun.findUniqueOrThrow({ where: { id: progress.runId } });
    const models = await db.job.groupBy({ by: ["embeddingModel"], where: { userId: user.id }, _count: { _all: true } });
    const feed = await getFeed(user.id, { page: 1, filters: { group: "for_you" } });

    console.log("\nLive search run");
    console.log(`  status            ${run.status} in ${Math.round((Date.now() - started) / 1000)} s, ${calls} calls`);
    console.log(`  forced Adzuna 429 ${forceFail ? `${forced} responses` : "off"}`);
    console.log(`  requests          ${JSON.stringify(run.requestsByProvider)}`);
    console.log(
      `  postings          ${run.resultCount} found · ${run.newCount} new · ${run.duplicateCount} duplicates merged`,
    );
    console.log(
      `  embeddings        ${models.map((m) => `${m.embeddingModel ?? "none"} ${m._count._all}`).join(" · ")}`,
    );
    console.log(`  feed              ${JSON.stringify(feed.counts)}`);
    if (deep) {
      console.log(
        `  deep search       ${progress.discoveryDone} web searches · ${progress.newSites} new sites · ${progress.sitesRead} sites read · ${progress.siteJobs} matching jobs · ${progress.newSiteJobs} new`,
      );
      const direct = await db.job.count({ where: { userId: user.id, isDirectFromCompany: true } });
      const directOnly = await db.job.count({ where: { userId: user.id, provider: "company_site" } });
      console.log(`  direct jobs       ${direct} direct from a company site · ${directOnly} found only there`);
    }
    console.log(`  run notes         ${JSON.stringify(run.errors)}`);
    console.log("  top matches");
    for (const card of feed.cards.slice(0, 5)) {
      console.log(`    ${String(card.score).padStart(3)}  ${card.title} · ${card.companyName} · ${card.provider}`);
    }
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
