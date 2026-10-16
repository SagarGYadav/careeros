import { describe, expect, it } from "vitest";
import { planStatusChange, stageOf, suggestSource, type StatusFields } from "@/lib/applications/status";
import { changeStatusSchema, markAppliedSchema } from "@/lib/validation/application";

const NOW = new Date("2026-10-16T10:00:00Z");
const APPLIED_AT = new Date("2026-10-01T10:00:00Z");
const DAY = 86_400_000;

const app = (over: Partial<StatusFields> = {}) => ({
  status: "APPLIED",
  stageReached: 1,
  closedAt: null,
  rejectionReason: null,
  rejectedAtStage: null,
  lastActivityAt: APPLIED_AT,
  appliedAt: APPLIED_AT,
  ...over,
});

describe("status changes", () => {
  it("raises stageReached with each later stage and never lowers it", () => {
    const toInterview = planStatusChange(app(), { to: "INTERVIEW", occurredAt: NOW }, NOW);
    expect(toInterview.fields).toMatchObject({ status: "INTERVIEW", stageReached: 4, closedAt: null });
    expect(toInterview.event).toMatchObject({
      fromStatus: "APPLIED",
      toStatus: "INTERVIEW",
      title: "Moved to Interview",
    });
    expect(toInterview.offerRound).toBe(true);

    const back = planStatusChange(
      app({ status: "INTERVIEW", stageReached: 4 }),
      { to: "ASSESSMENT", occurredAt: NOW },
      NOW,
    );
    expect(back.fields.stageReached).toBe(4);
    expect(back.offerRound).toBe(false);
  });

  it("needs a reason for a rejection and counts the stage it happened at as reached", () => {
    expect(() => planStatusChange(app(), { to: "REJECTED", occurredAt: NOW }, NOW)).toThrow(/why it was rejected/);

    const atCurrent = planStatusChange(
      app({ status: "ASSESSMENT", stageReached: 3 }),
      { to: "REJECTED", occurredAt: NOW, rejectionReason: "failed_assessment" },
      NOW,
    );
    expect(atCurrent.fields).toMatchObject({
      status: "REJECTED",
      stageReached: 3,
      rejectionReason: "failed_assessment",
      rejectedAtStage: "ASSESSMENT",
      closedAt: NOW,
    });
    expect(atCurrent.event.title).toBe("Rejected at Assessment: Didn't pass the assessment");

    // The user says it ended after an interview that was never logged: the interview counts as reached.
    const later = planStatusChange(
      app(),
      { to: "REJECTED", occurredAt: NOW, rejectionReason: "failed_interview", rejectedAtStage: "INTERVIEW" },
      NOW,
    );
    expect(later.fields).toMatchObject({ stageReached: 4, rejectedAtStage: "INTERVIEW" });
  });

  it("closes on rejected, withdrawn and ghosted, and reopening clears the close and the rejection", () => {
    for (const to of ["WITHDRAWN", "GHOSTED"] as const) {
      expect(planStatusChange(app(), { to, occurredAt: NOW }, NOW).fields.closedAt).toEqual(NOW);
    }
    const rejected = app({
      status: "REJECTED",
      stageReached: 4,
      closedAt: NOW,
      rejectionReason: "no_reason_given",
      rejectedAtStage: "INTERVIEW",
    });
    const reopened = planStatusChange(rejected, { to: "FINAL_ROUND", occurredAt: NOW }, NOW);
    expect(reopened.fields).toMatchObject({
      status: "FINAL_ROUND",
      stageReached: 5,
      closedAt: null,
      rejectionReason: null,
      rejectedAtStage: null,
    });
    expect(reopened.event.title).toBe("Reopened: Final round");
    // Rejected again from a closed status: the default stage is the highest one reached.
    const again = planStatusChange(
      app({ status: "GHOSTED", stageReached: 2, closedAt: NOW }),
      { to: "REJECTED", occurredAt: NOW, rejectionReason: "position_filled" },
      NOW,
    );
    expect(again.fields.rejectedAtStage).toBe("RECRUITER_CONTACT");
  });

  it("refuses the same status, future dates and dates before applying; keeps the latest activity", () => {
    expect(() => planStatusChange(app(), { to: "APPLIED", occurredAt: NOW }, NOW)).toThrow(/already/);
    expect(() => planStatusChange(app(), { to: "OFFER", occurredAt: new Date(NOW.getTime() + 2 * DAY) }, NOW)).toThrow(
      /future/,
    );
    expect(() =>
      planStatusChange(app(), { to: "OFFER", occurredAt: new Date(APPLIED_AT.getTime() - 2 * DAY) }, NOW),
    ).toThrow(/before you applied/);
    // Logging something that happened before the last activity doesn't move the activity date back.
    const earlier = new Date(APPLIED_AT.getTime() + DAY);
    const plan = planStatusChange(app({ lastActivityAt: NOW }), { to: "ASSESSMENT", occurredAt: earlier }, NOW);
    expect(plan.fields.lastActivityAt).toEqual(NOW);
    expect(plan.event.occurredAt).toEqual(earlier);
  });

  it("knows the stage of each status", () => {
    expect(["APPLIED", "RECRUITER_CONTACT", "ASSESSMENT", "INTERVIEW", "FINAL_ROUND", "OFFER"].map(stageOf)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(stageOf("REJECTED")).toBeNull();
  });
});

describe("where the user applied", () => {
  it("is prefilled from the job's first apply link", () => {
    const link = (site: string, url: string) => [{ site, url }];
    expect(
      suggestSource({ isDirectFromCompany: false, applyLinks: link("LinkedIn", "https://www.linkedin.com/jobs/1") }),
    ).toBe("linkedin");
    expect(suggestSource({ isDirectFromCompany: false, applyLinks: link("Naukri.com", "https://x.example/1") })).toBe(
      "naukri",
    );
    expect(
      suggestSource({
        isDirectFromCompany: true,
        applyLinks: link("Kestrel Pay careers", "https://jobs.kestrel.example/1"),
      }),
    ).toBe("company_site");
    expect(suggestSource({ isDirectFromCompany: false, applyLinks: link("Adzuna", "https://www.adzuna.in/1") })).toBe(
      "other_job_site",
    );
    expect(suggestSource({ isDirectFromCompany: false, applyLinks: [] })).toBe("other");
  });
});

describe("application inputs", () => {
  it("keeps a referrer name only for a referral and reads ISO times", () => {
    const base = {
      appliedAt: "2026-10-16T06:30:00.000Z",
      resumeVersionId: null,
      source: "linkedin",
      isReferral: false,
      referrerName: "Someone",
      inbound: false,
      notes: "",
    };
    expect(markAppliedSchema.parse(base)).toMatchObject({
      referrerName: null,
      notes: null,
      appliedAt: new Date("2026-10-16T06:30:00Z"),
    });
    expect(markAppliedSchema.parse({ ...base, isReferral: true }).referrerName).toBe("Someone");
    expect(markAppliedSchema.safeParse({ ...base, source: "telegram" }).success).toBe(false);
    expect(markAppliedSchema.safeParse({ ...base, appliedAt: "yesterday" }).success).toBe(false);
  });

  it("accepts only known statuses, reasons and stages", () => {
    const base = { applicationId: "a1", to: "REJECTED", occurredAt: "2026-10-16T06:30:00+05:30" };
    expect(changeStatusSchema.safeParse({ ...base, rejectionReason: "salary", rejectedAtStage: "OFFER" }).success).toBe(
      true,
    );
    expect(changeStatusSchema.safeParse({ ...base, to: "SAVED" }).success).toBe(false);
    expect(changeStatusSchema.safeParse({ ...base, rejectedAtStage: "REJECTED" }).success).toBe(false);
  });
});
