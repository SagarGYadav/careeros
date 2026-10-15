import { describe, expect, it } from "vitest";
import { readAtsBoard, type AtsContext } from "@/lib/careersites/adapters";
import type { AtsKind } from "@/lib/careersites/ats";
import { locationMatches, titleMatches, wantPosting } from "@/lib/careersites/postings";
import { readCareersPage } from "@/lib/careersites/reader";
import { fetchJson } from "@/lib/jobsearch/http";
import { fetchPublicPage } from "@/lib/web/fetch-page";
import { decodeEntities } from "@/lib/web/jsonld";
import { createHostThrottle, extractEmbedUrls, extractLinks } from "@/lib/web/links";
import { listJobsHeuristically } from "@/server/ai/career-page-extractor";
import { FIXTURE_FILTER, FIXTURE_SITES, fixtureFetch } from "../../fixtures/careersites/web";

/** Reads one fixture site the way the app does: ATS API, or the careers page (and an embedded board). */
async function readFixture(site: (typeof FIXTURE_SITES)[number]["site"]) {
  const web = fixtureFetch();
  const budget = { pages: 30 };
  const want = (p: Parameters<AtsContext["want"]>[0]) => wantPosting(p, FIXTURE_FILTER);
  const ats: AtsContext = {
    getJson: <T>(url: string) => fetchJson<T>(new URL(url).hostname, url, { fetch: web.fetch }),
    want,
    budget,
  };
  if (site.kind !== "html") {
    const board = await readAtsBoard(site.kind as AtsKind, site.token!, site.name, ats);
    return { ...board, method: "ats", requested: web.requested };
  }
  const read = await readCareersPage(site.url, {
    fetchPage: (url) => fetchPublicPage(url, web),
    listJobs: async (input) => listJobsHeuristically(input),
    want,
    wantTitle: (title) => titleMatches(title, FIXTURE_FILTER.titleVariants),
    budget,
    company: site.name,
  });
  if (read.embedded) {
    const board = await readAtsBoard(read.embedded.kind as AtsKind, read.embedded.token!, site.name, ats);
    return { ...board, method: "embedded_ats", requested: web.requested };
  }
  return { postings: read.postings, total: read.total, method: read.method, requested: web.requested };
}

describe("reading the recorded career sites", () => {
  const readable = FIXTURE_SITES.filter(
    (s) => s.category === "ats" || s.category === "jsonld" || s.category === "html",
  );

  it.each(readable.map((s) => [s.id, s] as const))(
    "%s: finds every job and keeps the matching ones",
    async (_, fixture) => {
      const result = await readFixture(fixture.site);
      expect(result.total).toBe(fixture.allTitles.length);
      expect(result.postings.map((p) => p.title).sort()).toEqual([...fixture.matching].sort());
      for (const p of result.postings) {
        expect(p.description.length).toBeGreaterThan(10);
        expect(p.url).toMatch(/^https:\/\//);
        expect(p.description).not.toMatch(/&lt;|<p>/); // decoded and stripped
      }
    },
  );

  it("uses the right method for each kind of site", async () => {
    const methods = Object.fromEntries(
      await Promise.all(readable.map(async (f) => [f.id, (await readFixture(f.site)).method] as const)),
    );
    expect(methods).toMatchObject({
      "jsonld-northwind": "jsonld",
      "jsonld-pages-lumen": "jsonld_pages",
      "jsonld-marigold": "jsonld",
      "embedded-saffron": "embedded_ats",
      "html-bluebell": "ai_links",
      "html-juniper": "ai_links",
      "html-quill": "ai_links",
    });
  });

  it("never requests a page robots.txt disallows", async () => {
    const fixture = FIXTURE_SITES.find((s) => s.id === "robots-tidepool")!;
    const web = fixtureFetch();
    await expect(
      readCareersPage(fixture.site.url, {
        fetchPage: (url) => fetchPublicPage(url, web),
        listJobs: async () => [],
        want: () => true,
        wantTitle: () => true,
        budget: { pages: 5 },
        company: fixture.site.name,
      }),
    ).rejects.toMatchObject({ code: "FETCH_BLOCKED_BY_ROBOTS" });
    expect(web.requested).toEqual(["https://www.tidepool.example/robots.txt"]);
  });

  it("reports a failing site and finds nothing on a page without openings", async () => {
    await expect(readFixture(FIXTURE_SITES.find((s) => s.id === "failing-halcyon-site")!.site)).rejects.toMatchObject({
      code: "URL_FETCH_FAILED",
    });
    const empty = await readFixture(FIXTURE_SITES.find((s) => s.id === "empty-larkspur")!.site);
    expect(empty).toMatchObject({ method: "none", total: 0, postings: [] });
  });

  it("spends detail requests only on matching SmartRecruiters postings", async () => {
    const result = await readFixture(FIXTURE_SITES.find((s) => s.id === "smartrecruiters-mosaic")!.site);
    expect(result.requested.filter((u) => /postings\/\d+$/.test(u))).toEqual([
      "https://api.smartrecruiters.com/v1/companies/MosaicRetailCloud/postings/744001",
    ]);
  });
});

describe("local filters", () => {
  it("matches titles by their role words, whatever the level or spelling", () => {
    const variants = ["Frontend Developer", "React Developer"];
    expect(titleMatches("Senior Front-End Engineer II", variants)).toBe(true);
    expect(titleMatches("React JS Developer", variants)).toBe(true);
    expect(titleMatches("Backend Engineer (Go)", variants)).toBe(false);
    expect(titleMatches("Developer", variants)).toBe(false);
  });

  it("keeps the user's cities, remote roles open to India, and India-wide when no city is set", () => {
    const prefs = { cities: ["Bengaluru"], remoteOk: true };
    expect(locationMatches("Bengaluru, Karnataka, India", null, prefs)).toBe(true);
    expect(locationMatches("Remote - India", null, prefs)).toBe(true);
    expect(locationMatches("Remote", "remote", prefs)).toBe(true);
    expect(locationMatches("Remote (US only)", "remote", prefs)).toBe(false);
    expect(locationMatches("Pune", null, prefs)).toBe(false);
    expect(locationMatches("San Francisco, CA", null, { cities: [], remoteOk: false })).toBe(false);
    expect(locationMatches("Pune, India", null, { cities: [], remoteOk: false })).toBe(true);
    expect(locationMatches("Remote", "remote", { cities: ["Bengaluru"], remoteOk: false })).toBe(false);
  });

  it("drops postings older than 60 days", () => {
    const base = { title: "Frontend Developer", location: "Bengaluru", workModeHint: null };
    expect(wantPosting({ ...base, postedAt: new Date("2026-08-01") }, FIXTURE_FILTER)).toBe(false);
    expect(wantPosting({ ...base, postedAt: new Date("2026-09-01") }, FIXTURE_FILTER)).toBe(true);
  });
});

describe("page helpers", () => {
  it("decodes entity-encoded HTML", () => {
    expect(decodeEntities("&lt;p&gt;A &amp; B&#39;s &#x2014; C&lt;/p&gt;")).toBe("<p>A & B's — C</p>");
  });

  it("reads links with their text, and every embedded URL", () => {
    const html = `<a href="/jobs/1">Frontend <b>Developer</b></a><a href="#top">Top</a><a href="javascript:void(0)">x</a>
      <iframe src="https://boards.greenhouse.io/embed/job_board?for=acme&amp;b=1"></iframe>`;
    expect(extractLinks(html, "https://acme.example/careers")).toEqual([
      { url: "https://acme.example/jobs/1", text: "Frontend Developer" },
      { url: "https://acme.example/careers", text: "Top" },
    ]);
    expect(extractEmbedUrls(html, "https://acme.example/careers")).toContain(
      "https://boards.greenhouse.io/embed/job_board?for=acme&b=1",
    );
  });

  it("waits at least a second between requests to the same host", async () => {
    let clock = 0;
    const waits: number[] = [];
    const wait = createHostThrottle(1_000, {
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await wait("https://a.example/1");
    await wait("https://a.example/2");
    await wait("https://b.example/1");
    await wait("https://a.example/3");
    expect(waits).toEqual([1_000, 1_000]);
  });
});
