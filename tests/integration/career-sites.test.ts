// Company career-site registry and discovery against the test database, with the mock web search.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { mockWebSearchProvider, type WebSearchProvider } from "@/lib/websearch/providers";
import { createWebSearchRunner } from "@/lib/websearch/runner";
import { db } from "@/server/db";
import { savePreferences } from "@/server/repositories/profile";
import {
  addToWatchlist,
  discoverCareerSites,
  listCareerSitesView,
  removeCareerSite,
} from "@/server/services/career-sites";
import { addCustomRole } from "@/server/services/target-roles";

const EMAIL_DOMAIN = "@sites.integration.careeros.test";
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  userId = randomUUID();
  otherUserId = randomUUID();
  await db.user.createMany({
    data: [
      { id: userId, name: "Sites Test", email: `s-${userId}${EMAIL_DOMAIN}` },
      { id: otherUserId, name: "Other", email: `o-${otherUserId}${EMAIL_DOMAIN}` },
    ],
  });
  await addCustomRole(userId, "Frontend Developer");
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
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("career sites", () => {
  it("adds watchlist links (classified now) and names (found later)", async () => {
    expect(await addToWatchlist(userId, { value: "https://jobs.lever.co/copperleaf/123" })).toMatchObject({
      created: true,
    });
    expect(await addToWatchlist(userId, { value: "jobs.lever.co/copperleaf" })).toMatchObject({ created: false });
    await addToWatchlist(userId, { value: "Tamarind Commerce" });
    await expect(addToWatchlist(userId, { value: "https://www.linkedin.com/company/x" })).rejects.toMatchObject({
      code: "URL_FETCH_BLOCKED",
    });
    const sites = await listCareerSitesView(userId);
    expect(sites.map((s) => [s.kind, s.status, s.source])).toEqual(
      expect.arrayContaining([
        ["lever", "active", "user"],
        ["unknown", "unresolved", "user"],
      ]),
    );
  }, 60_000);

  it("discovers ATS boards and careers pages with web searches, and resolves watchlist names", async () => {
    const summary = await discoverCareerSites(userId, { maxSearches: 12 });
    expect(summary.searches).toBe(12);
    expect(summary.providers).toEqual({ mock: 12 });
    expect(summary.stoppedBecause).toBeNull();
    expect(summary.resolvedWatchlist).toBe(1); // Tamarind Commerce → its Ashby board
    const sites = await listCareerSitesView(userId);
    const keys = await db.careerSite.findMany({ where: { userId }, select: { key: true, source: true } });
    expect(keys.map((k) => k.key)).toEqual(
      expect.arrayContaining([
        "greenhouse:kestrelpay",
        "greenhouse:lumenledger",
        "lever:copperleaf",
        "ashby:tamarind-commerce",
        "smartrecruiters:mosaicretailcloud",
        "recruitee:halcyonstreams",
        "html:bluebelltravel.keka.com/careers",
      ]),
    );
    expect(keys.some((k) => k.key.includes("linkedin"))).toBe(false);
    // The watchlist name became the real board and stays the user's.
    expect(keys.find((k) => k.key === "ashby:tamarind-commerce")?.source).toBe("user");
    expect(sites.some((s) => s.status === "unresolved")).toBe(false);
    // The lever board was on the watchlist already: still one entry, still the user's.
    expect(keys.filter((k) => k.key === "lever:copperleaf")).toEqual([{ key: "lever:copperleaf", source: "user" }]);

    const again = await discoverCareerSites(userId, { maxSearches: 12 });
    expect(again.newSites).toBe(0);
  }, 120_000);

  it("stops when the web search allowance is used up and says so", async () => {
    const usedUp: WebSearchProvider = {
      ...mockWebSearchProvider(),
      name: "tavily",
      isMock: false,
      limits: { month: 1 },
    };
    const store = new MemoryProviderStore();
    await store.recordRequest("web_search", "tavily", new Date());
    const runner = createWebSearchRunner({
      getProviders: async () => ({ providers: [usedUp], disabled: new Set() }),
      store,
    });
    const summary = await discoverCareerSites(userId, { runner, maxSearches: 5 });
    expect(summary).toMatchObject({ searches: 0, newSites: 0 });
    expect(summary.stoppedBecause).toMatch(/used up/);
  }, 60_000);

  it("keeps each user's registry separate", async () => {
    const mine = await db.careerSite.findFirstOrThrow({ where: { userId } });
    await expect(removeCareerSite(otherUserId, mine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listCareerSitesView(otherUserId)).toEqual([]);
    await removeCareerSite(userId, mine.id);
    expect(await db.careerSite.count({ where: { id: mine.id } })).toBe(0);
  }, 60_000);
});
