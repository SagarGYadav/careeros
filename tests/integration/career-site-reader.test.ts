// Reading registered career sites against the test database, with the recorded fixture web (no network).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCareerSite, listDueSites } from "@/server/repositories/career-sites";
import { readCareerSite } from "@/server/services/career-site-reader";
import { FIXTURE_FILTER, FIXTURE_SITES, fixtureFetch } from "../../fixtures/careersites/web";

const EMAIL_DOMAIN = "@reader.integration.careeros.test";
const NOW = FIXTURE_FILTER.now;
const DAY = 86_400_000;
let userId: string;

const deps = () => ({ ...fixtureFetch(), throttle: async () => {} });

async function addSite(id: string) {
  const s = FIXTURE_SITES.find((f) => f.id === id)!.site;
  return createCareerSite(userId, {
    key: s.token ? `${s.kind}:${s.token.toLowerCase()}` : `html:${new URL(s.url).hostname}${new URL(s.url).pathname}`,
    kind: s.kind,
    boardToken: s.token,
    url: s.url,
    name: s.name,
    source: "discovered",
  });
}

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Reader Test", email: `r-${userId}${EMAIL_DOMAIN}` } });
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("reading career sites", () => {
  it("reads an ATS board and records counts and the next daily check", async () => {
    const site = await addSite("greenhouse-kestrelpay");
    const result = await readCareerSite(userId, site.id, { now: NOW, filter: FIXTURE_FILTER, deps: deps() });
    expect(result).toMatchObject({ method: "ats", total: 4, status: "active", error: null });
    expect(result.postings.map((p) => p.title).sort()).toEqual(["React Developer", "Senior Frontend Engineer"]);
    const saved = await db.careerSite.findUniqueOrThrow({ where: { id: site.id } });
    expect(saved).toMatchObject({ lastJobCount: 4, relevantJobCount: 2, emptyRuns: 0, failures: 0, lastError: null });
    expect(saved.nextCheckAt?.getTime()).toBe(NOW.getTime() + DAY);
    expect(await listDueSites(userId, NOW, 10)).toEqual([]);
    expect((await listDueSites(userId, new Date(NOW.getTime() + DAY), 10)).map((s) => s.id)).toEqual([site.id]);
  }, 60_000);

  it("checks a site weekly after three runs without a matching job", async () => {
    const site = await addSite("empty-larkspur");
    for (let run = 0; run < 3; run++) {
      await readCareerSite(userId, site.id, { now: NOW, filter: FIXTURE_FILTER, deps: deps() });
    }
    const saved = await db.careerSite.findUniqueOrThrow({ where: { id: site.id } });
    expect(saved).toMatchObject({ status: "no_relevant_jobs", emptyRuns: 3 });
    expect(saved.nextCheckAt?.getTime()).toBe(NOW.getTime() + 7 * DAY);
  }, 60_000);

  it("respects robots.txt for 30 days, and backs off a failing site", async () => {
    const robots = await addSite("robots-tidepool");
    const web = deps();
    const blocked = await readCareerSite(userId, robots.id, { now: NOW, filter: FIXTURE_FILTER, deps: web });
    expect(blocked.status).toBe("blocked_by_robots");
    expect(web.requested).not.toContain("https://www.tidepool.example/careers");
    expect((await db.careerSite.findUniqueOrThrow({ where: { id: robots.id } })).nextCheckAt?.getTime()).toBe(
      NOW.getTime() + 30 * DAY,
    );

    const failing = await addSite("failing-halcyon-site");
    const gaps: number[] = [];
    for (let run = 0; run < 3; run++) {
      await readCareerSite(userId, failing.id, { now: NOW, filter: FIXTURE_FILTER, deps: deps() });
      const s = await db.careerSite.findUniqueOrThrow({ where: { id: failing.id } });
      gaps.push((s.nextCheckAt!.getTime() - NOW.getTime()) / DAY);
    }
    expect(gaps).toEqual([1, 2, 4]);
    expect(await db.careerSite.findUniqueOrThrow({ where: { id: failing.id } })).toMatchObject({
      status: "failed",
      failures: 3,
      lastError: expect.stringContaining("500"),
    });
  }, 60_000);

  it("turns a careers page that embeds a board into that board, or merges it into the known one", async () => {
    const page = await addSite("embedded-saffron");
    const result = await readCareerSite(userId, page.id, { now: NOW, filter: FIXTURE_FILTER, deps: deps() });
    expect(result).toMatchObject({ method: "ats", siteId: page.id, total: 2 });
    expect(await db.careerSite.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({
      kind: "greenhouse",
      boardToken: "saffronretail",
      key: "greenhouse:saffronretail",
    });

    // A second careers page for the same board merges into it.
    const twin = await createCareerSite(userId, {
      key: "html:jobs.saffron.example/careers",
      kind: "html",
      boardToken: null,
      url: "https://www.saffron.example/careers",
      name: "Saffron Retail",
      source: "discovered",
    });
    const merged = await readCareerSite(userId, twin.id, { now: NOW, filter: FIXTURE_FILTER, deps: deps() });
    expect(merged.siteId).toBe(page.id);
    expect(await db.careerSite.count({ where: { id: twin.id } })).toBe(0);
  }, 60_000);
});
