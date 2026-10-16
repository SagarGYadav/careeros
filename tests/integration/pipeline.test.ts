// The pipeline (SPEC §13) against the test database: board and table data, the application page, follow-ups,
// timeline notes, round results, offer decisions and Today's actions.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descriptionHash } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import { addInterviewRound, changeApplicationStatus, markAsApplied } from "@/server/services/applications";
import {
  addTimelineNote,
  getApplicationPage,
  getPipeline,
  getTodaysActions,
  setFollowUp,
  setOfferDecision,
  updateRound,
} from "@/server/services/pipeline";

const EMAIL_DOMAIN = "@pipeline.integration.careeros.test";
const NOW = new Date("2026-10-16T10:00:00Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
let userId: string;

async function createJob(title: string, feedStatus = "new") {
  const text = `${title} at Lumen Ledger. Build web apps in React. ${randomUUID()}`;
  return db.job.create({
    data: {
      userId,
      title,
      companyName: "Lumen Ledger",
      descriptionRaw: text,
      descriptionHash: descriptionHash(text),
      origin: "search",
      provider: "jooble",
      externalId: randomUUID(),
      applyLinks: [{ site: "LinkedIn", url: "https://www.linkedin.com/jobs/view/1" }],
      feedStatus,
      fitScore: 74,
    },
  });
}

const apply = (jobId: string, daysAgo: number) =>
  markAsApplied(
    userId,
    jobId,
    {
      appliedAt: at(-daysAgo),
      resumeVersionId: null,
      source: "linkedin",
      isReferral: false,
      referrerName: null,
      inbound: false,
      notes: "",
    },
    NOW,
  );

beforeAll(async () => {
  userId = randomUUID();
  await db.user.create({ data: { id: userId, name: "Pipeline Test", email: `p-${userId}${EMAIL_DOMAIN}` } });
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("pipeline", () => {
  it("shows applications with idle days and ghosting hints, and saved jobs not applied to", async () => {
    const quiet = await createJob("Frontend Engineer");
    const recent = await createJob("React Developer");
    const savedOnly = await createJob("UI Engineer", "saved");
    const savedApplied = await createJob("Web Developer", "saved");
    await apply(quiet.id, 35);
    await apply(recent.id, 3);
    await apply(savedApplied.id, 1);

    const { cards, saved } = await getPipeline(userId, NOW);
    const byTitle = Object.fromEntries(cards.map((c) => [c.title, c]));
    expect(byTitle["Frontend Engineer"]).toMatchObject({ idleDays: 35, ghostedSuggested: true, fitScore: 74 });
    expect(byTitle["React Developer"]).toMatchObject({ idleDays: 3, ghostedSuggested: false, status: "APPLIED" });
    expect(saved.map((s) => s.jobId)).toEqual([savedOnly.id]);

    const today = await getTodaysActions(userId, NOW);
    expect(today.openCount).toBe(3);
    expect(today.actions).toMatchObject([{ kind: "ghosted", title: "Frontend Engineer · Lumen Ledger" }]);
  }, 60_000);

  it("keeps follow-ups, timeline notes, round results and offer decisions", async () => {
    const job = await createJob("Senior Frontend Engineer");
    const { applicationId } = await apply(job.id, 10);

    await setFollowUp(userId, { applicationId, followUpAt: at(0) });
    expect((await getTodaysActions(userId, NOW)).actions.find((a) => a.applicationId === applicationId)).toMatchObject({
      kind: "follow_up",
      detail: "Follow up today",
    });
    // Logging the follow-up clears the reminder and counts as activity.
    await addTimelineNote(userId, { applicationId, occurredAt: at(0), title: "Sent a follow-up email" }, NOW);
    let page = await getApplicationPage(userId, applicationId, NOW);
    expect(page).toMatchObject({ followUpAt: null, idleDays: 0, lastActivityAt: at(0) });
    expect(page.events[0]).toMatchObject({ type: "note", title: "Sent a follow-up email" });

    await changeApplicationStatus(userId, { applicationId, to: "INTERVIEW", occurredAt: at(0) }, NOW);
    const { roundId } = await addInterviewRound(
      userId,
      { applicationId, roundType: "system_design", scheduledAt: at(-0.1) },
      NOW,
    );
    await updateRound(userId, { roundId, result: "passed", selfRating: 4, notes: "Caching questions" }, NOW);
    page = await getApplicationPage(userId, applicationId, NOW);
    expect(page.rounds).toMatchObject([{ result: "passed", selfRating: 4, notes: "Caching questions" }]);
    expect(page.events[0].title).toBe("System design round: passed");

    await expect(setOfferDecision(userId, { applicationId, decision: "accepted" }, NOW)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await changeApplicationStatus(userId, { applicationId, to: "OFFER", occurredAt: at(0) }, NOW);
    expect((await getTodaysActions(userId, NOW)).actions.find((a) => a.applicationId === applicationId)?.kind).toBe(
      "offer",
    );
    await setOfferDecision(userId, { applicationId, decision: "accepted" }, NOW);
    page = await getApplicationPage(userId, applicationId, NOW);
    expect(page).toMatchObject({ offerDecision: "accepted", stageReached: 6 });
    expect(page.events[0].title).toBe("Offer accepted");
    expect(page.snapshot.job).toMatchObject({ title: "Senior Frontend Engineer", companyName: "Lumen Ledger" });
  }, 60_000);

  it("refuses other users' applications and rounds", async () => {
    const job = await createJob("Frontend Developer");
    const { applicationId } = await apply(job.id, 2);
    const { roundId } = await addInterviewRound(userId, { applicationId, roundType: "hr", scheduledAt: null }, NOW);
    const stranger = randomUUID();
    await db.user.create({ data: { id: stranger, name: "Stranger", email: `s-${stranger}${EMAIL_DOMAIN}` } });
    await expect(getApplicationPage(stranger, applicationId, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setFollowUp(stranger, { applicationId, followUpAt: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateRound(stranger, { roundId, result: "failed", selfRating: null, notes: null }, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getPipeline(stranger, NOW)).cards).toEqual([]);
  }, 60_000);
});
