// Application statuses, stages and transitions (SPEC §5, §13). Pure: the service applies the plan in one transaction.
import { AppError } from "@/lib/errors";

/**
 * Statuses an application can have. SPEC §5 also lists SAVED; saved jobs stay in the feed ("Saved" group) and an
 * application starts when the user applies, so SAVED is never stored here.
 */
export const APPLICATION_STATUSES = [
  "APPLIED",
  "RECRUITER_CONTACT",
  "ASSESSMENT",
  "INTERVIEW",
  "FINAL_ROUND",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Stages in order (SPEC §5): stageReached is the highest one ever recorded. */
export const STAGES = {
  APPLIED: 1,
  RECRUITER_CONTACT: 2,
  ASSESSMENT: 3,
  INTERVIEW: 4,
  FINAL_ROUND: 5,
  OFFER: 6,
} as const satisfies Partial<Record<ApplicationStatus, number>>;
export type StageStatus = keyof typeof STAGES;
export const STAGE_STATUSES = Object.keys(STAGES) as StageStatus[];

/** Statuses that end an application. */
export const CLOSED_STATUSES = ["REJECTED", "WITHDRAWN", "GHOSTED"] as const satisfies ApplicationStatus[];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  RECRUITER_CONTACT: "Recruiter contact",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  FINAL_ROUND: "Final round",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  GHOSTED: "Ghosted",
};

export const REJECTION_REASONS = {
  skills_mismatch: "Skills didn't match",
  experience_level: "Too junior or too senior",
  salary: "Salary expectations",
  location: "Location or work mode",
  notice_period: "Notice period",
  position_filled: "Position filled or closed",
  internal_candidate: "Went to another candidate",
  failed_assessment: "Didn't pass the assessment",
  failed_interview: "Didn't pass an interview",
  no_reason_given: "No reason given",
  other: "Other",
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

/** Where the user applied (prefilled from the job, editable). Analytics group by this later (SPEC §16). */
export const APPLICATION_SOURCES = {
  company_site: "Company careers site",
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
  other_job_site: "Another job site",
  recruiter: "Through a recruiter",
  email: "By email",
  other: "Other",
} as const;
export type ApplicationSource = keyof typeof APPLICATION_SOURCES;

export const ROUND_TYPES = {
  recruiter_screen: "Recruiter screen",
  technical: "Technical",
  coding: "Coding",
  system_design: "System design",
  take_home: "Take-home",
  hiring_manager: "Hiring manager",
  behavioural: "Behavioural",
  hr: "HR",
  final: "Final",
  other: "Other",
} as const;
export type RoundType = keyof typeof ROUND_TYPES;

export const stageOf = (status: string): number | null => STAGES[status as StageStatus] ?? null;
export const isClosed = (status: string) => (CLOSED_STATUSES as readonly string[]).includes(status);
/** Moving to these stages offers to log an interview round (SPEC §13). */
export const offersRound = (status: string) => status === "INTERVIEW" || status === "FINAL_ROUND";

/** Prefills "Where did you apply?" from the job's first apply link, the one the job page shows first. */
export function suggestSource(job: {
  isDirectFromCompany: boolean;
  applyLinks: { site: string; url: string }[];
}): ApplicationSource {
  const first = job.applyLinks[0];
  if (!first) return job.isDirectFromCompany ? "company_site" : "other";
  const where = `${first.site} ${first.url}`.toLowerCase();
  if (where.includes("linkedin")) return "linkedin";
  if (where.includes("naukri")) return "naukri";
  if (where.includes("indeed")) return "indeed";
  // The company's own page is listed first for direct jobs (Phase 5).
  if (job.isDirectFromCompany) return "company_site";
  return "other_job_site";
}

/** The fields a status change touches; stored on the event as "previous" so undo restores them exactly. */
export type StatusFields = {
  status: string;
  stageReached: number;
  closedAt: Date | null;
  rejectionReason: string | null;
  rejectedAtStage: string | null;
  lastActivityAt: Date;
};

export type StatusChangeInput = {
  to: ApplicationStatus;
  occurredAt: Date;
  rejectionReason?: RejectionReason | null;
  rejectedAtStage?: StageStatus | null;
};

export type StatusChangePlan = {
  fields: StatusFields;
  event: { type: "status_change"; fromStatus: string; toStatus: string; occurredAt: Date; title: string };
  /** The UI offers to log an interview round. */
  offerRound: boolean;
};

const DAY = 86_400_000;

/**
 * Plans a status change (SPEC §5, §13): stageReached never goes down; a rejection needs a reason and the stage it
 * happened at (which counts as reached); closing sets closedAt and reopening clears it. Throws VALIDATION for an
 * impossible change.
 */
export function planStatusChange(
  current: StatusFields & { appliedAt: Date },
  input: StatusChangeInput,
  now: Date,
): StatusChangePlan {
  const { to, occurredAt } = input;
  if (current.status === to) {
    throw new AppError("VALIDATION", { message: `This application is already "${STATUS_LABELS[to]}".` });
  }
  // A day of slack either way: the browser sends its local time, and "today" may differ by time zone.
  if (occurredAt.getTime() > now.getTime() + DAY) {
    throw new AppError("VALIDATION", { message: "That date is in the future." });
  }
  if (occurredAt.getTime() < current.appliedAt.getTime() - DAY) {
    throw new AppError("VALIDATION", { message: "That date is before you applied." });
  }

  let stageReached = Math.max(current.stageReached, stageOf(to) ?? 0);
  let rejectionReason: string | null = null;
  let rejectedAtStage: string | null = null;
  let title = `Moved to ${STATUS_LABELS[to]}`;

  if (to === "REJECTED") {
    if (!input.rejectionReason || !(input.rejectionReason in REJECTION_REASONS)) {
      throw new AppError("VALIDATION", { message: "Choose why it was rejected (or “No reason given”)." });
    }
    // Default: rejected at the stage the application was in (or the highest one reached, if it was closed).
    const atStage =
      input.rejectedAtStage ??
      (stageOf(current.status) !== null
        ? (current.status as StageStatus)
        : STAGE_STATUSES[Math.max(current.stageReached, 1) - 1]);
    if (!(atStage in STAGES)) throw new AppError("VALIDATION", { message: "Choose the stage it was rejected at." });
    rejectionReason = input.rejectionReason;
    rejectedAtStage = atStage;
    // Being rejected after an interview means the interview happened, even if it was never logged.
    stageReached = Math.max(stageReached, STAGES[atStage]);
    title = `Rejected at ${STATUS_LABELS[atStage]}: ${REJECTION_REASONS[input.rejectionReason]}`;
  } else if (to === "WITHDRAWN") {
    title = "Withdrew the application";
  } else if (to === "GHOSTED") {
    title = "Marked as ghosted (no reply)";
  } else if (isClosed(current.status)) {
    title = `Reopened: ${STATUS_LABELS[to]}`;
  }

  return {
    fields: {
      status: to,
      stageReached,
      closedAt: isClosed(to) ? occurredAt : null,
      rejectionReason,
      rejectedAtStage,
      lastActivityAt: occurredAt.getTime() > current.lastActivityAt.getTime() ? occurredAt : current.lastActivityAt,
    },
    event: { type: "status_change", fromStatus: current.status, toStatus: to, occurredAt, title },
    offerRound: offersRound(to),
  };
}
