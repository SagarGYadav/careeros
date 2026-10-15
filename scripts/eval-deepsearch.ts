// Deep-search evaluation (SPEC §11.6) on the recorded fixture set (fixtures/careersites/web.ts, 15 fictional
// sites served by a fake fetch: nothing reaches the network except the AI provider for CareerPageExtractor).
//   Targets: ATS and JSON-LD jobs 100% extracted; HTML pages ≥ 80% of job titles found; robots-disallowed sites
//   never fetched. (Duplicates merging with job-site results is checked by tests/integration/deep-search.test.ts.)
//
//   npm run eval:deepsearch                         CareerPageExtractor on Gemini (fast tier)
//   npm run eval:deepsearch -- --provider=groq
//   npm run eval:deepsearch -- --provider=mock      the no-AI reader only
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { buildAiProviders } from "@/lib/ai/providers";
import { createAiRunner } from "@/lib/ai/runner";
import { readAtsBoard, type AtsContext } from "@/lib/careersites/adapters";
import type { AtsKind } from "@/lib/careersites/ats";
import { titleMatches, wantPosting } from "@/lib/careersites/postings";
import { readCareersPage } from "@/lib/careersites/reader";
import { normalizeForMatch } from "@/lib/cv/text";
import { fetchJson } from "@/lib/jobsearch/http";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { fetchPublicPage } from "@/lib/web/fetch-page";
import { listJobsWithAi } from "@/server/ai/career-page-extractor";
import { FIXTURE_FILTER, FIXTURE_SITES, fixtureFetch } from "../fixtures/careersites/web";

type Row = {
  id: string;
  category: string;
  method: string;
  found: number;
  expected: number;
  missed: string[];
  matchingOk: boolean;
  note: string;
};

async function main() {
  const providerName = process.argv.find((a) => a.startsWith("--provider="))?.split("=")[1] ?? "gemini";
  const provider = buildAiProviders({ ...process.env, AI_PROVIDERS: providerName }).find(
    (p) => p.name === providerName,
  );
  if (!provider?.configured) {
    console.error(`Provider "${providerName}" isn't configured. Add its API key to .env, or use --provider=mock.`);
    process.exit(1);
  }
  const aiCalls: Record<string, number> = {};
  const runner = createAiRunner({
    getProviders: async () => ({ providers: [provider], disabled: new Set() }),
    store: new MemoryProviderStore(),
    // Count answers by outcome, so a silent fallback to the no-AI reader can't pass for the model's work.
    log: async (entry) => {
      aiCalls[entry.status] = (aiCalls[entry.status] ?? 0) + 1;
    },
  });
  console.log(
    `Deep-search eval on ${FIXTURE_SITES.length} recorded sites (CareerPageExtractor: ${provider.label}, ${provider.models.fast})\n`,
  );

  const rows: Row[] = [];
  for (const fixture of FIXTURE_SITES) {
    const web = fixtureFetch();
    const budget = { pages: 30 };
    const want = (p: Parameters<AtsContext["want"]>[0]) => wantPosting(p, FIXTURE_FILTER);
    const ats: AtsContext = {
      getJson: <T>(url: string) => fetchJson<T>(new URL(url).hostname, url, { fetch: web.fetch }),
      want,
      budget,
    };
    let titles: string[] = [];
    let postings: string[] = [];
    let method = "ats";
    let note = "";
    try {
      if (fixture.site.kind !== "html") {
        const board = await readAtsBoard(fixture.site.kind as AtsKind, fixture.site.token!, fixture.site.name, ats);
        titles = board.titles;
        postings = board.postings.map((p) => p.title);
      } else {
        const page = await readCareersPage(fixture.site.url, {
          fetchPage: (url) => fetchPublicPage(url, web),
          listJobs: (input) => listJobsWithAi(runner, input),
          want,
          wantTitle: (title) => titleMatches(title, FIXTURE_FILTER.titleVariants),
          budget,
          company: fixture.site.name,
        });
        method = page.method;
        if (page.embedded) {
          const board = await readAtsBoard(page.embedded.kind as AtsKind, page.embedded.token!, fixture.site.name, ats);
          titles = board.titles;
          postings = board.postings.map((p) => p.title);
        } else {
          titles = page.titles;
          postings = page.postings.map((p) => p.title);
        }
      }
    } catch (error) {
      method = "error";
      note = error instanceof Error ? error.message : String(error);
    }
    if (fixture.category === "robots") {
      note = web.requested.includes(fixture.site.url) ? "FETCHED despite robots.txt" : "never fetched (robots.txt)";
    }
    const found = new Set(titles.map(normalizeForMatch));
    const missed = fixture.allTitles.filter((t) => !found.has(normalizeForMatch(t)));
    const matchingOk = [...postings].sort().join("|") === [...fixture.matching].sort().join("|");
    rows.push({
      id: fixture.id,
      category: fixture.category,
      method,
      found: fixture.allTitles.length - missed.length,
      expected: fixture.allTitles.length,
      missed,
      matchingOk,
      note,
    });
    const row = rows.at(-1)!;
    console.log(
      `  ${row.id.padEnd(24)} ${row.category.padEnd(8)} ${row.method.padEnd(13)} titles ${row.found}/${row.expected}  matching ${row.matchingOk ? "ok" : "differs"}` +
        (row.missed.length ? `  missed: ${row.missed.join("; ")}` : "") +
        (row.note ? `  ${row.note}` : ""),
    );
  }

  const share = (cats: string[]) => {
    const r = rows.filter((x) => cats.includes(x.category));
    return { found: r.reduce((n, x) => n + x.found, 0), total: r.reduce((n, x) => n + x.expected, 0) };
  };
  const pct = (r: { found: number; total: number }) =>
    `${r.total ? ((r.found / r.total) * 100).toFixed(1) : "100.0"}% (${r.found}/${r.total})`;
  const structured = share(["ats", "jsonld"]);
  const html = share(["html"]);
  const robotsOk = rows.filter((r) => r.category === "robots").every((r) => r.note.startsWith("never"));
  const matching = rows.filter((r) => r.matchingOk).length;
  console.log(`\nATS + JSON-LD jobs extracted   ${pct(structured)}   target 100%`);
  console.log(`HTML pages: job titles found   ${pct(html)}   target ≥ 80%`);
  console.log(`Robots-disallowed sites        ${robotsOk ? "never fetched" : "FETCHED"}   target never fetched`);
  console.log(`CareerPageExtractor requests: ${JSON.stringify(aiCalls)}`);
  console.log(`Sites with exactly the expected matching jobs   ${matching}/${rows.length}`);
  const met = structured.found === structured.total && html.total > 0 && html.found / html.total >= 0.8 && robotsOk;
  console.log(met ? "\nTargets met." : "\nTargets not met yet.");

  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/eval-deepsearch.json",
    JSON.stringify(
      { provider: provider.name, at: new Date().toISOString(), structured, html, robotsOk, rows },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
