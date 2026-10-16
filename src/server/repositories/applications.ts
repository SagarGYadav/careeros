import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { StatusFields } from "@/lib/applications/status";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;
// Neon may take a few seconds to hand out a connection after being idle; Prisma's default wait is 2 s.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export type NewApplication = {
  jobId: string;
  status: string;
  stageReached: number;
  appliedAt: Date;
  resumeVersionId: string | null;
  source: string;
  isReferral: boolean;
  referrerName: string | null;
  direction: "outbound" | "inbound";
  notes: string | null;
  jobSnapshot: unknown;
};

type NewEvent = {
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  occurredAt: Date;
  title: string;
  note?: string | null;
  previous?: unknown;
};

/** Creates the application and its first timeline event together. Null if the job already has one. */
export async function createApplication(userId: string, row: NewApplication, event: NewEvent) {
  try {
    return await db.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: { ...row, userId, jobSnapshot: json(row.jobSnapshot), lastActivityAt: row.appliedAt },
      });
      await tx.applicationEvent.create({
        data: { ...event, previous: undefined, userId, applicationId: application.id },
      });
      return application;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    // Unique jobId: a second "Mark as applied" (two tabs, a double click) finds the first one.
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

export async function getApplication(userId: string, applicationId: string) {
  return db.application.findFirst({ where: { id: applicationId, userId } });
}

/** The application for a job, with its CV version name, timeline and rounds (newest first). */
export async function getApplicationForJob(userId: string, jobId: string) {
  return db.application.findFirst({
    where: { jobId, userId },
    include: {
      resumeVersion: { select: { id: true, name: true } },
      events: { orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }] },
      rounds: { orderBy: [{ scheduledAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] },
    },
  });
}

/**
 * Applies a planned status change and records it on the timeline in one transaction (SPEC §5: stageReached is
 * updated together with every status change). The update only happens if the status is still `fromStatus`, so two
 * changes at once (two tabs, a drag and a click) can't overwrite each other; returns null when it lost that race.
 */
export async function applyStatusChange(
  userId: string,
  applicationId: string,
  fromStatus: string,
  fields: StatusFields,
  event: NewEvent,
) {
  return db.$transaction(async (tx) => {
    const updated = await tx.application.updateMany({
      where: { id: applicationId, userId, status: fromStatus },
      data: fields,
    });
    if (updated.count === 0) return null;
    return tx.applicationEvent.create({
      data: { ...event, previous: json(event.previous), userId, applicationId },
    });
  }, TRANSACTION_OPTIONS);
}

/** The latest status change, the only one that can be undone. */
export async function latestStatusEvent(userId: string, applicationId: string) {
  return db.applicationEvent.findFirst({
    where: { userId, applicationId, type: { in: ["status_change"] } },
    orderBy: { createdAt: "desc" },
  });
}

/** Undoes a status change: restores the fields saved on the event and removes it, if nothing changed since. */
export async function revertStatusChange(
  userId: string,
  applicationId: string,
  eventId: string,
  currentStatus: string,
  previous: StatusFields,
) {
  return db.$transaction(async (tx) => {
    const updated = await tx.application.updateMany({
      where: { id: applicationId, userId, status: currentStatus },
      data: previous,
    });
    if (updated.count === 0) return false;
    await tx.applicationEvent.deleteMany({ where: { id: eventId, userId, applicationId } });
    return true;
  }, TRANSACTION_OPTIONS);
}

export async function createInterviewRound(
  userId: string,
  applicationId: string,
  round: { roundType: string; scheduledAt: Date | null; notes: string | null },
  event: NewEvent,
  lastActivityAt: Date,
) {
  return db.$transaction(async (tx) => {
    const created = await tx.interviewRound.create({
      data: { ...round, userId, applicationId, topicSkillIds: [], questionsAsked: [] },
    });
    await tx.applicationEvent.create({ data: { ...event, previous: undefined, userId, applicationId } });
    await tx.application.updateMany({ where: { id: applicationId, userId }, data: { lastActivityAt } });
    return created;
  }, TRANSACTION_OPTIONS);
}
