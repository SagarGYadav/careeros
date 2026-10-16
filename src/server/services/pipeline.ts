import "server-only";
import { z } from "zod";
import { idleDays, suggestsGhosted, todaysActions, type TodayAction } from "@/lib/applications/activity";
import { ROUND_TYPES, type RoundType } from "@/lib/applications/status";
import { AppError } from "@/lib/errors";
import {
  OFFER_DECISIONS,
  ROUND_RESULTS,
  followUpSchema,
  notesSchema,
  offerDecisionSchema,
  timelineNoteSchema,
  updateRoundSchema,
} from "@/lib/validation/application";
import {
  applicationStatusesForJobs,
  getApplication,
  getApplicationDetail,
  getInterviewRound,
  listApplications,
  listSavedJobsWithoutApplication,
  listSnapshots,
  updateApplicationFields,
  updateInterviewRound,
} from "@/server/repositories/applications";
import { linksOf } from "./search-runs";

/** The parts of the frozen snapshot (SPEC §13) the pages show; anything unreadable falls back to empty. */
const snapshotSchema = z
  .object({
    takenAt: z.string().catch(""),
    job: z
      .object({
        title: z.string().catch("Job"),
        companyName: z.string().catch(""),
        location: z.string().nullable().catch(null),
        workMode: z.string().nullable().catch(null),
        salary: z.string().nullable().catch(null),
        description: z.string().catch(""),
        applyLinks: z.array(z.object({ site: z.string(), url: z.string() })).catch([]),
      })
      .catch({
        title: "Job",
        companyName: "",
        location: null,
        workMode: null,
        salary: null,
        description: "",
        applyLinks: [],
      }),
    fit: z
      .object({ scoreTotal: z.number(), recommendation: z.string(), analysedAt: z.string() })
      .nullable()
      .catch(null),
  })
  .catch({
    takenAt: "",
    job: {
      title: "Job",
      companyName: "",
      location: null,
      workMode: null,
      salary: null,
      description: "",
      applyLinks: [],
    },
    fit: null,
  });

export type PipelineCard = {
  id: string;
  jobId: string | null;
  title: string;
  companyName: string;
  status: string;
  stageReached: number;
  appliedAt: string;
  lastActivityAt: string;
  /** Days without activity for an open application (highlighted from 14), null when closed. */
  idleDays: number | null;
  ghostedSuggested: boolean;
  source: string;
  resumeName: string | null;
  isReferral: boolean;
  inbound: boolean;
  fitScore: number | null;
  nextRound: { roundType: RoundType; scheduledAt: string } | null;
};

export type SavedCard = {
  jobId: string;
  title: string;
  companyName: string;
  score: number | null;
  city: string | null;
};

/** The board and table (SPEC §13): every application, plus saved jobs not applied to yet. */
export async function getPipeline(
  userId: string,
  now = new Date(),
): Promise<{ cards: PipelineCard[]; saved: SavedCard[] }> {
  const [applications, saved] = await Promise.all([listApplications(userId), listSavedJobsWithoutApplication(userId)]);
  const orphaned = applications.filter((a) => !a.job).map((a) => a.id);
  const snapshots = new Map(
    (await listSnapshots(userId, orphaned)).map((s) => [s.id, snapshotSchema.parse(s.jobSnapshot).job]),
  );
  return {
    cards: applications.map((a) => {
      const job = a.job ?? snapshots.get(a.id);
      const next = a.rounds
        .filter((r) => r.result === "pending" && r.scheduledAt && r.scheduledAt >= now)
        .sort((x, y) => x.scheduledAt!.getTime() - y.scheduledAt!.getTime())[0];
      return {
        id: a.id,
        jobId: a.jobId,
        title: job?.title ?? "Job",
        companyName: job?.companyName ?? "",
        status: a.status,
        stageReached: a.stageReached,
        appliedAt: a.appliedAt.toISOString(),
        lastActivityAt: a.lastActivityAt.toISOString(),
        idleDays: idleDays(a, now),
        ghostedSuggested: suggestsGhosted(a, now),
        source: a.source,
        resumeName: a.resumeVersion?.name ?? null,
        isReferral: a.isReferral,
        inbound: a.direction === "inbound",
        fitScore: a.job?.fitScore ?? null,
        nextRound: next
          ? { roundType: next.roundType as RoundType, scheduledAt: next.scheduledAt!.toISOString() }
          : null,
      };
    }),
    saved: saved.map((j) => ({
      jobId: j.id,
      title: j.title,
      companyName: j.companyName,
      score: j.fitScore ?? j.quickScore,
      city: j.locationCity,
    })),
  };
}

export type ApplicationDetailView = {
  id: string;
  jobId: string | null;
  status: string;
  stageReached: number;
  appliedAt: string;
  closedAt: string | null;
  lastActivityAt: string;
  idleDays: number | null;
  ghostedSuggested: boolean;
  source: string;
  isReferral: boolean;
  referrerName: string | null;
  direction: string;
  resumeName: string | null;
  rejectionReason: string | null;
  rejectedAtStage: string | null;
  followUpAt: string | null;
  offerDecision: keyof typeof OFFER_DECISIONS | null;
  notes: string | null;
  applyLinks: { site: string; url: string }[];
  snapshot: z.infer<typeof snapshotSchema>;
  events: { id: string; type: string; title: string; note: string | null; occurredAt: string }[];
  rounds: {
    id: string;
    roundType: RoundType;
    scheduledAt: string | null;
    result: keyof typeof ROUND_RESULTS;
    selfRating: number | null;
    notes: string | null;
  }[];
};

/** The application page: timeline, rounds, follow-up, notes and what was applied to. */
export async function getApplicationPage(
  userId: string,
  applicationId: string,
  now = new Date(),
): Promise<ApplicationDetailView> {
  const a = await getApplicationDetail(userId, applicationId);
  if (!a) throw new AppError("NOT_FOUND");
  const snapshot = snapshotSchema.parse(a.jobSnapshot);
  return {
    id: a.id,
    jobId: a.jobId,
    status: a.status,
    stageReached: a.stageReached,
    appliedAt: a.appliedAt.toISOString(),
    closedAt: a.closedAt?.toISOString() ?? null,
    lastActivityAt: a.lastActivityAt.toISOString(),
    idleDays: idleDays(a, now),
    ghostedSuggested: suggestsGhosted(a, now),
    source: a.source,
    isReferral: a.isReferral,
    referrerName: a.referrerName,
    direction: a.direction,
    resumeName: a.resumeVersion?.name ?? null,
    rejectionReason: a.rejectionReason,
    rejectedAtStage: a.rejectedAtStage,
    followUpAt: a.followUpAt?.toISOString() ?? null,
    offerDecision: (a.offerDecision as ApplicationDetailView["offerDecision"]) ?? null,
    notes: a.notes,
    // The live job's links when it still exists (they may have been merged since), else the frozen ones.
    applyLinks: a.job ? linksOf(a.job.applyLinks) : snapshot.job.applyLinks,
    snapshot,
    events: a.events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      note: e.note,
      occurredAt: e.occurredAt.toISOString(),
    })),
    rounds: a.rounds.map((r) => ({
      id: r.id,
      roundType: r.roundType as RoundType,
      scheduledAt: r.scheduledAt?.toISOString() ?? null,
      result: r.result as keyof typeof ROUND_RESULTS,
      selfRating: r.selfRating,
      notes: r.notes,
    })),
  };
}

async function requireApplication(userId: string, applicationId: string) {
  const application = await getApplication(userId, applicationId);
  if (!application) throw new AppError("NOT_FOUND");
  return application;
}

/** Sets or clears the follow-up reminder that Today's actions shows. */
export async function setFollowUp(userId: string, input: unknown) {
  const { applicationId, followUpAt } = followUpSchema.parse(input);
  await requireApplication(userId, applicationId);
  await updateApplicationFields(userId, applicationId, { followUpAt });
}

export async function saveNotes(userId: string, input: unknown) {
  const { applicationId, notes } = notesSchema.parse(input);
  await requireApplication(userId, applicationId);
  await updateApplicationFields(userId, applicationId, { notes: notes ?? null });
}

/** Logs something that happened outside CareerOS; it counts as activity and clears a due follow-up. */
export async function addTimelineNote(userId: string, input: unknown, now = new Date()) {
  const values = timelineNoteSchema.parse(input);
  const application = await requireApplication(userId, values.applicationId);
  if (values.occurredAt.getTime() > now.getTime() + 86_400_000) {
    throw new AppError("VALIDATION", { message: "That date is in the future." });
  }
  const latest = values.occurredAt > application.lastActivityAt ? values.occurredAt : application.lastActivityAt;
  const followUpDone = application.followUpAt && application.followUpAt <= values.occurredAt;
  await updateApplicationFields(
    userId,
    application.id,
    { lastActivityAt: latest, ...(followUpDone ? { followUpAt: null } : {}) },
    { type: "note", occurredAt: values.occurredAt, title: values.title, note: values.note ?? null },
  );
}

export async function setOfferDecision(userId: string, input: unknown, now = new Date()) {
  const { applicationId, decision } = offerDecisionSchema.parse(input);
  const application = await requireApplication(userId, applicationId);
  if (application.status !== "OFFER") {
    throw new AppError("VALIDATION", { message: "Move the application to Offer first." });
  }
  await updateApplicationFields(
    userId,
    applicationId,
    { offerDecision: decision, lastActivityAt: now },
    decision === "pending" ? undefined : { type: "note", occurredAt: now, title: `Offer ${decision}` },
  );
}

/** Records how a round went; a changed result is added to the timeline. */
export async function updateRound(userId: string, input: unknown, now = new Date()) {
  const values = updateRoundSchema.parse(input);
  const round = await getInterviewRound(userId, values.roundId);
  if (!round) throw new AppError("NOT_FOUND");
  const label = ROUND_TYPES[round.roundType as RoundType] ?? round.roundType;
  const changed = values.result !== round.result && values.result !== "pending";
  await updateInterviewRound(
    userId,
    round.id,
    { result: values.result, selfRating: values.selfRating, notes: values.notes ?? null },
    changed
      ? {
          applicationId: round.applicationId,
          type: "round_result",
          occurredAt: now,
          title: `${label} round: ${ROUND_RESULTS[values.result].toLowerCase()}`,
        }
      : null,
    now,
  );
}

/** Today's actions for the Overview (SPEC §2, §13), computed in code. */
export async function getTodaysActions(
  userId: string,
  now = new Date(),
): Promise<{
  actions: (Omit<TodayAction, "dueAt"> & { dueAt: string })[];
  openCount: number;
}> {
  const apps = await listApplications(userId);
  const actions = todaysActions(
    apps.map((a) => ({
      id: a.id,
      title: a.job?.title ?? "Job",
      companyName: a.job?.companyName ?? "",
      status: a.status,
      lastActivityAt: a.lastActivityAt,
      followUpAt: a.followUpAt,
      offerDecision: a.offerDecision,
      rounds: a.rounds,
    })),
    now,
    (type) => ROUND_TYPES[type as RoundType] ?? type,
  );
  return {
    actions: actions.map((a) => ({ ...a, dueAt: a.dueAt.toISOString() })),
    openCount: apps.filter((a) => idleDays(a, now) !== null).length,
  };
}

/** Application status per job, for the feed's "Applied" badges. */
export async function applicationStatusByJob(userId: string, jobIds: string[]): Promise<Record<string, string>> {
  const rows = await applicationStatusesForJobs(userId, jobIds);
  return Object.fromEntries(rows.filter((r) => r.jobId).map((r) => [r.jobId!, r.status]));
}
