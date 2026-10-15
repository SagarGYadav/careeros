// Deep search inside a search run (SPEC §11.3–11.5) against the test database: discovery with the mock web
// search, site reading with the recorded fixture web (nothing reaches the network), and merging with job-site
// results.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { mockWebSearchProvider } from "@/lib/websearch/providers";
import { createWebSearchRunner } from "@/lib/websearch/runner";
import { db } from "@/server/db";
import { createCareerSite } from "@/server/repositories/career-sites";
import { savePreferences } from "@/server/repositories/profile";
import { listTargetRoles, updateTargetRole } from "@/server/repositories/target-roles";
import { addJob } from "@/server/services/add-job";
import { advanceSearchRun, startSearchRun, type AdvanceOptions, type RunProgress } from "@/server/services/search-runs";
import { addCustomRole } from "@/server/services/target-roles";
import { fixtureFetch } from "../../fixtures/careersites/web";

const EMAIL_DOMAIN = "@deep.integration.careeros.test";
let userId: string;
const web = fixtureFetch();
const options: AdvanceOptions = {
  readerDeps: { fetch: web.fetch, lookup: web.lookup, throttle: async () => {} },
  allowMockDiscovery: true,
  webSearchRunner: createWebSearchRunner({
    getProviders: async () => ({ providers: [mockWebSearchProvider()], disabled: new Set() }),
    store: new MemoryProviderStore(),
  }),
};
const previous = process.env.DEEP_SEARCH_ENABLED;

async function runToEnd(start: RunProgress): Promise<RunProgress> {
  let progress = start;
  for (let step = 0; step < 60 && progress.status === "running"; step++) {
    progress = await advanceSearchRun(userId, progress.runId, options);
  }
  return progress;
}

beforeAll(async () => {
  process.env.DEEP_SEARCH_ENABLED = "true";
  process.env.JOB_DEEP_ANALYSIS_TOP_N = "0"; // Fit Reports are tested elsewhere; keep this run short
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Deep Test", email: `d-${userId}${EMAIL_DOMAIN}` } });
  await addCustomRole(userId, "Frontend Engineer");
  for (const role of await listTargetRoles(userId)) {
    await updateTargetRole(userId, role.id, {
      titleVariants: ["Frontend Developer", "Frontend Engineer", "React Developer"],
    });
  }
  await savePreferences(userId, {
    currentCtc: null,
    expectedCtcMin: null,
    expectedCtcMax: null,
    noticePeriodDays: 30,
    preferredLocations: ["Bengaluru"],
    workModes: ["hybrid", "remote"],
    openToRelocate: false,
    dealbreakers: { bond: false, nightShift: false, contractToHire: false, maxWfoDaysPerWeek: null },
  });
  // Known sites: a careers page with JSON-LD, and one whose robots.txt says no.
  for (const [key, url, name] of [
    ["html:careers.northwind.example/careers", "https://careers.northwind.example/careers", "Northwind Ledger"],
    ["html:www.tidepool.example/careers", "https://www.tidepool.example/careers", "Tidepool Analytics"],
  ]) {
    await createCareerSite(userId, { key, kind: "html", boardToken: null, url, name, source: "user" });
  }
  // The same Kestrel Pay job, found earlier on a job board (no company link yet).
  await addJob(userId, {
    title: "Senior Frontend Engineer",
    company: "Kestrel Pay",
    location: "Bengaluru",
    workMode: null,
    salaryText: null,
    description:
      "Kestrel Pay is hiring a Senior Frontend Engineer to build fast, accessible web apps in React and TypeScript. 3+ years of experience with modern frontend tooling; you will work with designers and backend engineers in Bengaluru.",
    applyUrl: "https://jobboard.example/kestrel/123",
    origin: "paste",
  });
}, 120_000);

afterAll(async () => {
  process.env.DEEP_SEARCH_ENABLED = previous;
  delete process.env.JOB_DEEP_ANALYSIS_TOP_N;
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("deep search in a search run", () => {
  it("discovers sites, reads them, and adds their jobs as direct from the company", async () => {
    const done = await runToEnd(await startSearchRun(userId));
    expect(done).toMatchObject({ status: "done" });
    expect(done.discoveryTotal).toBeGreaterThan(0);
    expect(done.discoveryDone).toBe(done.discoveryTotal);
    expect(done.newSites).toBeGreaterThan(0);
    expect(done.sitesTotal).toBeGreaterThanOrEqual(5);
    expect(done.sitesRead).toBe(done.sitesTotal);
    expect(done.siteJobs).toBeGreaterThan(0);

    const siteJobs = await db.job.findMany({ where: { userId, provider: "company_site" } });
    expect(siteJobs.length).toBe(done.newSiteJobs);
    expect(siteJobs.every((j) => j.isDirectFromCompany && j.origin === "deep_search" && j.quickScore !== null)).toBe(
      true,
    );
    const titles = siteJobs.map((j) => `${j.title} @ ${j.companyName}`);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Frontend Engineer @ Fictional Co",
        "Front-End Engineer II @ Copperleaf",
        "React Developer @ Kestrel Pay",
      ]),
    );
    // Only matching jobs join: not the Go backend role, not the San Francisco one.
    expect(titles.some((t) => t.startsWith("Backend Engineer"))).toBe(false);
    expect(siteJobs.some((j) => j.locationCity === "San Francisco")).toBe(false);

    // robots.txt said no: the page was never requested, and the registry says why.
    expect(web.requested).not.toContain("https://www.tidepool.example/careers");
    expect(
      await db.careerSite.findFirstOrThrow({ where: { userId, key: "html:www.tidepool.example/careers" } }),
    ).toMatchObject({
      status: "blocked_by_robots",
    });
  }, 300_000);

  it("merges a company-site posting with the same job from a job board, with the company page first", async () => {
    const kestrel = await db.job.findMany({
      where: { userId, companyName: "Kestrel Pay", title: "Senior Frontend Engineer" },
    });
    expect(kestrel).toHaveLength(1);
    const links = kestrel[0].applyLinks as { site: string; url: string }[];
    expect(links[0].url).toBe("https://boards.greenhouse.io/kestrelpay/jobs/4012001");
    expect(links.map((l) => l.url)).toContain("https://jobboard.example/kestrel/123");
    expect(kestrel[0].isDirectFromCompany).toBe(true);
  }, 60_000);

  it("finds nothing new on a second run, and doesn't re-read sites checked today", async () => {
    const before = await db.job.count({ where: { userId } });
    const again = await runToEnd(await startSearchRun(userId));
    expect(again).toMatchObject({ status: "done", newSiteJobs: 0 });
    expect(again.sitesTotal).toBe(0); // every site was read today; the next check is tomorrow
    expect(await db.job.count({ where: { userId } })).toBe(before);
  }, 300_000);
});
