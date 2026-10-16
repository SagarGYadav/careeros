// Application tracking against the test database (SPEC §13): Mark as applied, status changes with events and
// stageReached in one transaction, undo, interview rounds and user scoping.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { descriptionHash } from "@/lib/jobs/normalize";
import { db } from "@/server/db";
import {
  addInterviewRound,
  changeApplicationStatus,
  getApplicationPanel,
  markAsApplied,
  undoStatusChange,
} from "@/server/services/applications";

const EMAIL_DOMAIN = "@applications.integration.careeros.test";
const NOW = new Date("2026-10-16T10:00:00Z");
const at = (daysAfterNow: number) => new Date(NOW.getTime() + daysAfterNow * 86_400_000).toISOString();
let userId: string;
let otherUserId: string;
let resumeId: string;

async function createJob(owner: string, title: string) {
  const text = `${title} at Kestrel Pay. Build the merchant dashboard in React and TypeScript. ${randomUUID()}`;
  return db.job.create({
    data: {
      userId: owner,
      title,
      companyName: "Kestrel Pay",
      descriptionRaw: text,
      descriptionHash: descriptionHash(text),
      origin: "search",
      provider: "greenhouse",
      externalId: randomUUID(),
      isDirectFromCompany: true,
      applyLinks: [{ site: "Kestrel Pay careers", url: "https://jobs.kestrel.example/1" }],
      locationCity: "Bengaluru",
      quickScore: 81,
    },
  });
}

const applyInput = (over: Record<string, unknown> = {}) => ({
  appliedAt: at(-5),
  resumeVersionId: resumeId,
  source: "company_site",
  isReferral: true,
  referrerName: "A. Friend",
  inbound: false,
  notes: "",
  ...over,
});

beforeAll(async () => {
  userId = randomUUID();
  otherUserId = randomUUID();
  await db.user.createMany({
    data: [
      { id: userId, name: "Applications Test", email: `a-${userId}${EMAIL_DOMAIN}` },
      { id: otherUserId, name: "Other User", email: `o-${otherUserId}${EMAIL_DOMAIN}` },
    ],
  });
  const resume = await db.resumeVersion.create({
    data: { userId, name: "CV v1", isDefault: true, parseStatus: "confirmed", confirmedAt: NOW },
  });
  resumeId = resume.id;
}, 60_000);

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("Mark as applied", () => {
  it("creates the application with a frozen copy of the job and its Fit Report, once", async () => {
    const job = await createJob(userId, "Frontend Engineer");
    await db.jobAnalysis.create({
      data: {
        userId,
        jobId: job.id,
        scoringConfigVersion: 0,
        scoreTotal: 78,
        breakdown: { components: [] },
        recommendation: "APPLY",
        blockers: [],
        gains: [],
        report: { summary: "Strong React match." },
        inputHash: "h1",
      },
    });
    const panelBefore = await getApplicationPanel(userId, job.id);
    expect(panelBefore).toMatchObject({ application: null, suggestedSource: "company_site" });
    expect(panelBefore.resumes).toEqual([{ id: resumeId, name: "CV v1", isDefault: true }]);

    const { applicationId } = await markAsApplied(userId, job.id, applyInput(), NOW);
    const saved = await db.application.findUniqueOrThrow({ where: { id: applicationId }, include: { events: true } });
    expect(saved).toMatchObject({
      status: "APPLIED",
      stageReached: 1,
      direction: "outbound",
      isReferral: true,
      referrerName: "A. Friend",
      resumeVersionId: resumeId,
      appliedAt: new Date(at(-5)),
      lastActivityAt: new Date(at(-5)),
    });
    expect(saved.jobSnapshot).toMatchObject({
      version: 1,
      job: { title: "Frontend Engineer", companyName: "Kestrel Pay", isDirectFromCompany: true },
      fit: { scoreTotal: 78, recommendation: "APPLY", report: { summary: "Strong React match." } },
    });
    expect(saved.events).toMatchObject([
      { type: "applied", toStatus: "APPLIED", title: "Applied with a referral from A. Friend" },
    ]);

    // Later changes to the job don't touch the snapshot.
    await db.job.update({ where: { id: job.id }, data: { title: "Renamed posting" } });
    const again = await db.application.findUniqueOrThrow({ where: { id: applicationId } });
    expect(again.jobSnapshot).toMatchObject({ job: { title: "Frontend Engineer" } });

    await expect(markAsApplied(userId, job.id, applyInput(), NOW)).rejects.toMatchObject({
      code: "VALIDATION",
      message: expect.stringContaining("already"),
    });
  }, 60_000);

  it("starts an inbound application at Recruiter contact, and refuses another user's job or CV", async () => {
    const job = await createJob(userId, "React Developer");
    const { applicationId } = await markAsApplied(
      userId,
      job.id,
      applyInput({ inbound: true, isReferral: false, resumeVersionId: null, source: "recruiter" }),
      NOW,
    );
    expect(await db.application.findUniqueOrThrow({ where: { id: applicationId } })).toMatchObject({
      status: "RECRUITER_CONTACT",
      stageReached: 2,
      direction: "inbound",
      referrerName: null,
      jobSnapshot: expect.objectContaining({ fit: null }),
    });

    const otherJob = await createJob(otherUserId, "Frontend Engineer");
    await expect(markAsApplied(userId, otherJob.id, applyInput(), NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      markAsApplied(otherUserId, otherJob.id, applyInput({ resumeVersionId: resumeId }), NOW),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(markAsApplied(userId, job.id, applyInput({ appliedAt: at(3) }), NOW)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  }, 60_000);
});

describe("status changes", () => {
  it("writes an event and stageReached together, offers a round, logs it, and records a rejection", async () => {
    const job = await createJob(userId, "Senior Frontend Engineer");
    const { applicationId } = await markAsApplied(userId, job.id, applyInput({ isReferral: false }), NOW);

    const interview = await changeApplicationStatus(
      userId,
      { applicationId, to: "INTERVIEW", occurredAt: at(-2) },
      NOW,
    );
    expect(interview).toMatchObject({ status: "INTERVIEW", offerRound: true });
    expect(await db.application.findUniqueOrThrow({ where: { id: applicationId } })).toMatchObject({
      status: "INTERVIEW",
      stageReached: 4,
      lastActivityAt: new Date(at(-2)),
    });

    await addInterviewRound(
      userId,
      { applicationId, roundType: "technical", scheduledAt: at(-1), notes: "React hooks and testing" },
      NOW,
    );

    await expect(
      changeApplicationStatus(userId, { applicationId, to: "REJECTED", occurredAt: at(0) }, NOW),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await changeApplicationStatus(
      userId,
      {
        applicationId,
        to: "REJECTED",
        occurredAt: at(0),
        rejectionReason: "failed_interview",
        note: "Feedback by email",
      },
      NOW,
    );

    const panel = await getApplicationPanel(userId, job.id);
    expect(panel.application).toMatchObject({
      status: "REJECTED",
      stageReached: 4,
      rejectionReason: "failed_interview",
      rejectedAtStage: "INTERVIEW",
      closedAt: at(0),
      rounds: [{ roundType: "technical", scheduledAt: at(-1), result: "pending" }],
    });
    // Timeline, newest first.
    expect(panel.application!.events.map((e) => e.title)).toEqual([
      "Rejected at Interview: Didn't pass an interview",
      "Technical round logged",
      "Moved to Interview",
      "Applied",
    ]);
  }, 60_000);

  it("undoes only the latest change, exactly", async () => {
    const job = await createJob(userId, "UI Engineer");
    const { applicationId } = await markAsApplied(userId, job.id, applyInput({ isReferral: false }), NOW);
    const first = await changeApplicationStatus(userId, { applicationId, to: "ASSESSMENT", occurredAt: at(-3) }, NOW);
    const second = await changeApplicationStatus(userId, { applicationId, to: "OFFER", occurredAt: at(-1) }, NOW);

    await expect(undoStatusChange(userId, applicationId, first.eventId)).rejects.toMatchObject({ code: "VALIDATION" });
    await undoStatusChange(userId, applicationId, second.eventId);
    expect(await db.application.findUniqueOrThrow({ where: { id: applicationId } })).toMatchObject({
      status: "ASSESSMENT",
      stageReached: 3,
      lastActivityAt: new Date(at(-3)),
    });
    expect(await db.applicationEvent.count({ where: { applicationId } })).toBe(2);
    // Undoing twice fails: the change is gone.
    await expect(undoStatusChange(userId, applicationId, second.eventId)).rejects.toMatchObject({ code: "VALIDATION" });
  }, 60_000);

  it("lets only one of two simultaneous changes win, and hides applications from other users", async () => {
    const job = await createJob(userId, "Frontend Developer");
    const { applicationId } = await markAsApplied(userId, job.id, applyInput({ isReferral: false }), NOW);
    const results = await Promise.allSettled([
      changeApplicationStatus(userId, { applicationId, to: "ASSESSMENT", occurredAt: at(0) }, NOW),
      changeApplicationStatus(userId, { applicationId, to: "WITHDRAWN", occurredAt: at(0) }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.applicationEvent.count({ where: { applicationId, type: "status_change" } })).toBe(1);

    await expect(
      changeApplicationStatus(otherUserId, { applicationId, to: "OFFER", occurredAt: at(0) }, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addInterviewRound(otherUserId, { applicationId, roundType: "hr", scheduledAt: null }, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 60_000);
});
