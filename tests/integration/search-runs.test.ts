// A whole search run against the test database with the mock job search and mock embeddings.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_EMBEDDING_MODEL } from "@/lib/embeddings/providers";
import type { FeedFilters } from "@/lib/jobs/feed";
import { db } from "@/server/db";
import { savePreferences } from "@/server/repositories/profile";
import { listTargetRoles, updateTargetRole } from "@/server/repositories/target-roles";
import { getProfileEmbeddingInfo } from "@/server/repositories/vectors";
import { processCvUpload } from "@/server/services/cv-pipeline";
import {
  blockCompany,
  dismissJobs,
  getFeed,
  getSearchUsage,
  markFeedSeen,
  restoreJobs,
  setJobsSaved,
} from "@/server/services/feed";
import { getOnboardingChecklist } from "@/server/services/onboarding";
import { confirmResume } from "@/server/services/profile";
import { advanceSearchRun, getSearchOverview, startSearchRun, type RunProgress } from "@/server/services/search-runs";
import { addCustomRole, suggestTargetRoles } from "@/server/services/target-roles";

const EMAIL_DOMAIN = "@search.integration.careeros.test";
const NOW = new Date("2026-10-13T10:00:00Z");
let userId: string;

async function runToEnd(start: RunProgress): Promise<RunProgress> {
  let progress = start;
  for (let step = 0; step < 30 && progress.status === "running"; step++) {
    progress = await advanceSearchRun(userId, progress.runId);
  }
  return progress;
}

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Search Test", email: `s-${userId}${EMAIL_DOMAIN}` } });
  const bytes = new Uint8Array(readFileSync("fixtures/cv/ananya-single-column.pdf"));
  const { resumeId, draft } = await processCvUpload(userId, { fileName: "ananya.pdf", bytes }, { now: NOW });
  await confirmResume(userId, resumeId, draft, NOW);
  await suggestTargetRoles(userId);
  // Search for exactly one role, so the expected postings are known.
  for (const role of await listTargetRoles(userId)) await updateTargetRole(userId, role.id, { selected: false });
  await addCustomRole(userId, "React Developer");
  await savePreferences(userId, {
    currentCtc: null,
    expectedCtcMin: 1_800_000,
    expectedCtcMax: null,
    noticePeriodDays: 30,
    preferredLocations: ["Bengaluru"],
    workModes: ["hybrid", "remote"],
    openToRelocate: false,
    dealbreakers: { bond: false, nightShift: false, contractToHire: true, maxWfoDaysPerWeek: null },
  });
}, 180_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("search runs", () => {
  it("searches, merges duplicates, embeds, ranks and explains each job", async () => {
    const started = await startSearchRun(userId);
    expect(started).toMatchObject({ status: "running", stage: "search", queriesDone: 0 });
    expect(await startSearchRun(userId)).toMatchObject({ runId: started.runId }); // one run at a time

    const done = await runToEnd(started);
    expect(done).toMatchObject({ status: "done", stage: "done", embeddingsDeferred: false });
    expect(done.queriesDone).toBe(done.queriesTotal);
    expect(done.newJobs).toBeGreaterThan(0);
    expect(done.duplicates).toBeGreaterThanOrEqual(1);

    const jobs = await db.job.findMany({ where: { userId }, orderBy: { externalId: "asc" } });
    // "React JS Developer" in Bangalore is the same Kestrel Pay job as "React Developer" in Bengaluru: one record
    // remains (the fuller description wins) and it keeps both apply links.
    const pair = jobs.filter((j) => j.externalId === "mock-1" || j.externalId === "mock-1-dup1");
    expect(pair).toHaveLength(1);
    const kestrel = pair[0];
    expect((kestrel.applyLinks as unknown[]).length).toBe(2);
    expect(kestrel).toMatchObject({
      companyName: "Kestrel Pay",
      locationCity: "Bengaluru",
      salaryDisclosed: true,
      embeddingModel: MOCK_EMBEDDING_MODEL,
    });
    expect(kestrel.quickScore).toBeGreaterThan(0);
    expect((kestrel.scoreParts as { parts: unknown[] }).parts).toHaveLength(6);

    // The contract-to-hire agency posting is kept but marked "Not a fit" (the user's dealbreaker).
    const agency = jobs.find((j) => j.externalId === "mock-16")!;
    expect(agency.notFitReasons).toContain("Contract-to-hire.");
    expect(jobs.every((j) => j.quickScore !== null)).toBe(true);
    expect((await getProfileEmbeddingInfo(userId))?.model).toBe(MOCK_EMBEDDING_MODEL);

    // Fit Reports were written for the run's top new matches that fit (at most 5 by default).
    expect(done.analyseTotal).toBeGreaterThan(0);
    expect(done.analyseTotal).toBeLessThanOrEqual(5);
    expect(done.analysed).toBe(done.analyseTotal);
    const analysed = await db.job.findMany({ where: { userId, fitScore: { not: null } } });
    expect(analysed).toHaveLength(done.analyseTotal);
    expect(analysed.every((j) => j.sortScore === j.fitScore && j.notFitReasons.length === 0)).toBe(true);
    expect(await db.jobAnalysis.count({ where: { userId, report: { not: { equals: null } } } })).toBe(
      done.analyseTotal,
    );

    const overview = await getSearchOverview(userId);
    expect(overview.activeRunId).toBeNull();
    expect(overview.matches.length).toBeGreaterThan(0);
    expect(overview.matches.every((m) => m.score !== null)).toBe(true);
    expect(overview.matches.some((m) => m.title === "React Developer - Contract to Hire")).toBe(false);
  }, 240_000);

  it("finds nothing new when searching again, and doesn't duplicate saved jobs", async () => {
    const before = await db.job.count({ where: { userId } });
    // Pretend the first search ran a week ago: searching again keeps every job and marks them as seen again.
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    await db.job.updateMany({ where: { userId }, data: { discoveredAt: weekAgo, lastSeenAt: weekAgo } });
    const again = await runToEnd(await startSearchRun(userId));
    expect(again).toMatchObject({ status: "done", newJobs: 0 });
    expect(await db.job.count({ where: { userId } })).toBe(before);
    const jobs = await db.job.findMany({ where: { userId }, select: { discoveredAt: true, lastSeenAt: true } });
    expect(jobs.every((j) => j.discoveredAt.getTime() === weekAgo.getTime())).toBe(true);
    expect(jobs.filter((j) => j.lastSeenAt > weekAgo).length).toBeGreaterThan(0);
  }, 240_000);

  it("feeds the For you page: groups, filters, dismiss reasons that tune ranking, saving and blocking", async () => {
    const feed = (filters: Partial<FeedFilters> = {}, page = 1) =>
      getFeed(userId, { page, filters: { group: "for_you", ...filters } });

    const first = await feed();
    expect(first.hasJobs).toBe(true);
    expect(first.cards.length).toBeGreaterThan(0);
    // Sorted by Fit score where there is one, else by relevance.
    const scores = first.cards.map((c) => c.fitScore ?? c.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(first.cards.every((c) => c.notFitReasons.length === 0 && !c.staffing && !c.stale)).toBe(true);
    expect(first.cards[0].reasons.length).toBeGreaterThan(0);
    // Before the first visit nothing is "new".
    expect(first.cards.some((c) => c.isNew)).toBe(false);
    // The contract-to-hire agency posting sits in the hidden groups, counted.
    const notFit = await feed({ group: "not_fit" });
    expect(notFit.cards.some((c) => c.title === "React Developer - Contract to Hire")).toBe(true);
    expect(first.counts.not_fit).toBe(notFit.total);

    await markFeedSeen(userId, new Date("2000-01-01T00:00:00Z"));
    expect((await feed()).cards.every((c) => c.isNew)).toBe(true);
    await markFeedSeen(userId);
    expect((await feed()).cards.some((c) => c.isNew)).toBe(false);

    const city = first.cards[0].city!;
    expect((await feed({ city })).cards.every((c) => c.city === city)).toBe(true);
    expect((await feed({ workMode: "remote" })).cards.every((c) => c.workMode === "remote")).toBe(true);

    // Dismissing for the reason "company" ranks that company's other jobs lower, with the reason shown.
    const target =
      first.cards.find((c) => c.companyId && first.cards.filter((o) => o.companyId === c.companyId).length > 1) ??
      first.cards.find((c) => c.companyId)!;
    const sibling = first.cards.find((c) => c.companyId === target.companyId && c.id !== target.id);
    await dismissJobs(userId, [target.id], "company");
    const afterDismiss = await feed();
    expect(afterDismiss.cards.some((c) => c.id === target.id)).toBe(false);
    expect(afterDismiss.counts.dismissed).toBe(1);
    if (sibling) {
      const lowered = afterDismiss.cards.find((c) => c.id === sibling.id)!;
      expect(lowered.adjustments).toEqual([{ points: -15, reason: "You dismissed jobs from this company before." }]);
      expect(lowered.score).toBeLessThan(sibling.score!);
    }
    await restoreJobs(userId, [target.id]);
    expect((await feed()).counts.dismissed).toBe(0);

    // Saving and blocking.
    await setJobsSaved(userId, [first.cards[1].id], true);
    expect((await feed({ group: "saved" })).cards.map((c) => c.id)).toEqual([first.cards[1].id]);
    await blockCompany(userId, target.companyId!, true);
    const blocked = await feed({ group: "blocked" });
    expect(blocked.cards.length).toBeGreaterThan(0);
    expect((await feed()).cards.some((c) => c.companyId === target.companyId)).toBe(false);
    await blockCompany(userId, target.companyId!, false);

    // Market stats per role, computed after the run.
    const react = (await listTargetRoles(userId)).find((r) => r.selected)!;
    expect(react.marketStats).toMatchObject({ openings: expect.any(Number), averageRelevance: expect.any(Number) });
    expect((react.marketStats as { openings: number }).openings).toBeGreaterThan(0);
    expect((await feed({ roleId: react.id })).total).toBeGreaterThan(0);

    const usage = await getSearchUsage(userId);
    expect(usage.runs).toBe(2);
    expect(usage.requests.mock).toBeGreaterThan(0);
    const checklist = await getOnboardingChecklist(userId);
    expect(checklist.every((step) => step.done)).toBe(true);
  }, 240_000);

  it("refuses to start without a selected role", async () => {
    for (const role of await listTargetRoles(userId)) await updateTargetRole(userId, role.id, { selected: false });
    await expect(startSearchRun(userId)).rejects.toMatchObject({ code: "VALIDATION" });
  }, 60_000);
});
