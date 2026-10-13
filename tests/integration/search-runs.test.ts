// A whole search run against the test database with the mock job search and mock embeddings.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MOCK_EMBEDDING_MODEL } from "@/lib/embeddings/providers";
import { db } from "@/server/db";
import { savePreferences } from "@/server/repositories/profile";
import { listTargetRoles, updateTargetRole } from "@/server/repositories/target-roles";
import { getProfileEmbeddingInfo } from "@/server/repositories/vectors";
import { processCvUpload } from "@/server/services/cv-pipeline";
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

    const overview = await getSearchOverview(userId);
    expect(overview.activeRunId).toBeNull();
    expect(overview.matches.length).toBeGreaterThan(0);
    expect(overview.matches.every((m) => m.score !== null)).toBe(true);
    expect(overview.matches.some((m) => m.title === "React Developer - Contract to Hire")).toBe(false);
  }, 240_000);

  it("finds nothing new when searching again, and doesn't duplicate saved jobs", async () => {
    const before = await db.job.count({ where: { userId } });
    const again = await runToEnd(await startSearchRun(userId));
    expect(again).toMatchObject({ status: "done", newJobs: 0 });
    expect(await db.job.count({ where: { userId } })).toBe(before);
  }, 240_000);

  it("refuses to start without a selected role", async () => {
    for (const role of await listTargetRoles(userId)) await updateTargetRole(userId, role.id, { selected: false });
    await expect(startSearchRun(userId)).rejects.toMatchObject({ code: "VALIDATION" });
  }, 60_000);
});
