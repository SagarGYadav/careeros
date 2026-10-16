import "server-only";
import { z } from "zod";
import {
  ROUND_TYPES,
  STAGES,
  planStatusChange,
  suggestSource,
  type ApplicationSource,
  type RoundType,
  type StageStatus,
  type StatusFields,
} from "@/lib/applications/status";
import { AppError } from "@/lib/errors";
import { formatSalaryRange } from "@/lib/format";
import {
  addRoundSchema,
  changeStatusSchema,
  markAppliedSchema,
  type ChangeStatusValues,
} from "@/lib/validation/application";
import {
  applyStatusChange,
  createApplication,
  createInterviewRound,
  getApplication,
  getApplicationForJob,
  latestStatusEvent,
  revertStatusChange,
} from "@/server/repositories/applications";
import { getLatestJobAnalysis, listJobRequirements } from "@/server/repositories/job-analysis";
import { getJobDetail } from "@/server/repositories/jobs";
import { getResumeVersion, listResumeVersions } from "@/server/repositories/resumes";
import { linksOf } from "./search-runs";

/** Bump when the snapshot's shape changes; readers check it before trusting fields. */
const SNAPSHOT_VERSION = 1;

/**
 * Mark as applied (SPEC §13): creates the application with the CV version, where it was sent and any referral, and
 * freezes the job, its requirements and its latest Fit Report, so later changes to the posting or a new analysis
 * don't rewrite what the user applied to.
 */
export async function markAsApplied(userId: string, jobId: string, input: unknown, now = new Date()) {
  const values = markAppliedSchema.parse(input);
  if (values.appliedAt.getTime() > now.getTime() + 86_400_000) {
    throw new AppError("VALIDATION", { message: "The date you applied can't be in the future." });
  }
  const [job, requirements, analysis] = await Promise.all([
    getJobDetail(userId, jobId),
    listJobRequirements(userId, jobId),
    getLatestJobAnalysis(userId, jobId),
  ]);
  if (!job) throw new AppError("NOT_FOUND");
  if (values.resumeVersionId && !(await getResumeVersion(userId, values.resumeVersionId))) {
    throw new AppError("VALIDATION", { message: "Choose one of your CV versions." });
  }

  const status = values.inbound ? "RECRUITER_CONTACT" : "APPLIED";
  const snapshot = {
    version: SNAPSHOT_VERSION,
    takenAt: now.toISOString(),
    job: {
      title: job.title,
      companyName: job.companyName,
      location: job.location,
      city: job.locationCity,
      workMode: job.workMode,
      employmentType: job.employmentType,
      salary: job.salaryDisclosed ? formatSalaryRange(job.salaryMinAnnual, job.salaryMaxAnnual) : null,
      provider: job.provider,
      postedVia: job.postedVia,
      postedAt: job.postedAt?.toISOString() ?? null,
      isDirectFromCompany: job.isDirectFromCompany,
      applyLinks: linksOf(job.applyLinks),
      description: job.descriptionRaw,
      relevance: job.quickScore,
    },
    requirements: requirements.map((r) => ({
      reqId: r.reqId,
      text: r.text,
      kind: r.kind,
      importance: r.importance,
      quote: r.quote,
    })),
    fit: analysis && {
      analysisId: analysis.id,
      scoreTotal: analysis.scoreTotal,
      recommendation: analysis.recommendation,
      breakdown: analysis.breakdown,
      blockers: analysis.blockers,
      gains: analysis.gains,
      report: analysis.report,
      model: analysis.model,
      analysedAt: analysis.updatedAt.toISOString(),
    },
  };

  const created = await createApplication(
    userId,
    {
      jobId,
      status,
      stageReached: STAGES[status],
      appliedAt: values.appliedAt,
      resumeVersionId: values.resumeVersionId,
      source: values.source,
      isReferral: values.isReferral,
      referrerName: values.referrerName,
      direction: values.inbound ? "inbound" : "outbound",
      notes: values.notes ?? null,
      jobSnapshot: snapshot,
    },
    {
      type: "applied",
      toStatus: status,
      occurredAt: values.appliedAt,
      title: values.inbound
        ? "A recruiter reached out"
        : `Applied${values.isReferral ? ` with a referral${values.referrerName ? ` from ${values.referrerName}` : ""}` : ""}`,
      note: values.notes ?? null,
    },
  );
  if (!created) throw new AppError("VALIDATION", { message: "You've already marked this job as applied." });
  return { applicationId: created.id };
}

const statusFieldsSchema = z.object({
  status: z.string(),
  stageReached: z.number().int(),
  closedAt: z.coerce.date().nullable(),
  rejectionReason: z.string().nullable(),
  rejectedAtStage: z.string().nullable(),
  lastActivityAt: z.coerce.date(),
});

const fieldsOf = (a: StatusFields): StatusFields => ({
  status: a.status,
  stageReached: a.stageReached,
  closedAt: a.closedAt,
  rejectionReason: a.rejectionReason,
  rejectedAtStage: a.rejectedAtStage,
  lastActivityAt: a.lastActivityAt,
});

/**
 * Changes an application's status (SPEC §5, §13): the event and stageReached are written in one transaction;
 * REJECTED needs a reason and stage; moving to an interview stage tells the UI to offer adding a round.
 */
export async function changeApplicationStatus(userId: string, input: unknown, now = new Date()) {
  const values: ChangeStatusValues = changeStatusSchema.parse(input);
  const application = await getApplication(userId, values.applicationId);
  if (!application) throw new AppError("NOT_FOUND");
  const plan = planStatusChange(
    application,
    {
      to: values.to,
      occurredAt: values.occurredAt,
      rejectionReason: values.rejectionReason as Parameters<typeof planStatusChange>[1]["rejectionReason"],
      rejectedAtStage: (values.rejectedAtStage as StageStatus | null | undefined) ?? null,
    },
    now,
  );
  const event = await applyStatusChange(userId, application.id, application.status, plan.fields, {
    ...plan.event,
    note: values.note ?? null,
    previous: fieldsOf(application),
  });
  if (!event) {
    throw new AppError("VALIDATION", { message: "This application just changed elsewhere. Reload and try again." });
  }
  return { eventId: event.id, status: plan.fields.status, offerRound: plan.offerRound };
}

/** Undo for the toast after a status change: only the latest change, and only if nothing changed since. */
export async function undoStatusChange(userId: string, applicationId: string, eventId: string) {
  const [application, latest] = await Promise.all([
    getApplication(userId, applicationId),
    latestStatusEvent(userId, applicationId),
  ]);
  if (!application) throw new AppError("NOT_FOUND");
  const previous = statusFieldsSchema.safeParse(latest?.previous);
  if (!latest || latest.id !== eventId || latest.toStatus !== application.status || !previous.success) {
    throw new AppError("VALIDATION", { message: "That change can't be undone any more." });
  }
  if (!(await revertStatusChange(userId, applicationId, eventId, application.status, previous.data))) {
    throw new AppError("VALIDATION", { message: "That change can't be undone any more." });
  }
}

/** Logs an interview round (SPEC §18) and adds it to the timeline. */
export async function addInterviewRound(userId: string, input: unknown, now = new Date()) {
  const values = addRoundSchema.parse(input);
  const application = await getApplication(userId, values.applicationId);
  if (!application) throw new AppError("NOT_FOUND");
  const label = ROUND_TYPES[values.roundType];
  const round = await createInterviewRound(
    userId,
    application.id,
    { roundType: values.roundType, scheduledAt: values.scheduledAt, notes: values.notes ?? null },
    {
      type: "round_added",
      occurredAt: values.scheduledAt && values.scheduledAt < now ? values.scheduledAt : now,
      title: `${label} round ${values.scheduledAt && values.scheduledAt > now ? "scheduled" : "logged"}`,
      note: values.notes ?? null,
    },
    now,
  );
  return { roundId: round.id };
}

export type ApplicationView = {
  id: string;
  status: string;
  stageReached: number;
  appliedAt: string;
  closedAt: string | null;
  source: string;
  isReferral: boolean;
  referrerName: string | null;
  direction: string;
  resumeName: string | null;
  rejectionReason: string | null;
  rejectedAtStage: string | null;
  lastActivityAt: string;
  events: { id: string; type: string; title: string; note: string | null; occurredAt: string }[];
  rounds: { id: string; roundType: RoundType; scheduledAt: string | null; result: string }[];
};

export type ApplicationPanelView = {
  application: ApplicationView | null;
  resumes: { id: string; name: string; isDefault: boolean }[];
  suggestedSource: ApplicationSource;
};

/** What the job page needs to show the application, or the "Mark as applied" form with its prefilled values. */
export async function getApplicationPanel(userId: string, jobId: string): Promise<ApplicationPanelView> {
  const [job, application, resumes] = await Promise.all([
    getJobDetail(userId, jobId),
    getApplicationForJob(userId, jobId),
    listResumeVersions(userId),
  ]);
  if (!job) throw new AppError("NOT_FOUND");
  return {
    application: application && {
      id: application.id,
      status: application.status,
      stageReached: application.stageReached,
      appliedAt: application.appliedAt.toISOString(),
      closedAt: application.closedAt?.toISOString() ?? null,
      source: application.source,
      isReferral: application.isReferral,
      referrerName: application.referrerName,
      direction: application.direction,
      resumeName: application.resumeVersion?.name ?? null,
      rejectionReason: application.rejectionReason,
      rejectedAtStage: application.rejectedAtStage,
      lastActivityAt: application.lastActivityAt.toISOString(),
      events: application.events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        note: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
      rounds: application.rounds.map((r) => ({
        id: r.id,
        roundType: r.roundType as RoundType,
        scheduledAt: r.scheduledAt?.toISOString() ?? null,
        result: r.result,
      })),
    },
    // Only CVs that were read and confirmed can be chosen; the default (the profile's) comes first.
    resumes: resumes
      .filter((r) => r.parseStatus === "confirmed")
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      .map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault })),
    suggestedSource: suggestSource({
      isDirectFromCompany: job.isDirectFromCompany,
      applyLinks: linksOf(job.applyLinks),
    }),
  };
}
