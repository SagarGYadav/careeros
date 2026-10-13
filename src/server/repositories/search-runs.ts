import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function createSearchRun(
  userId: string,
  data: { targetRoleIds: string[]; plan: unknown; state: unknown },
) {
  return db.jobSearchRun.create({
    data: {
      userId,
      kind: "standard",
      targetRoleIds: data.targetRoleIds,
      plan: json(data.plan),
      state: json(data.state),
    },
  });
}

export async function getSearchRun(userId: string, runId: string) {
  return db.jobSearchRun.findFirst({ where: { id: runId, userId } });
}

/** The run still in progress, if any (a run idle for a day is treated as abandoned). */
export async function getActiveSearchRun(userId: string) {
  return db.jobSearchRun.findFirst({
    where: { userId, status: "running", updatedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestFinishedRun(userId: string) {
  return db.jobSearchRun.findFirst({ where: { userId, status: "done" }, orderBy: { createdAt: "desc" } });
}

export async function saveSearchRun(
  userId: string,
  runId: string,
  data: {
    state: unknown;
    requestsByProvider: Record<string, number>;
    pagesFetched: number;
    resultCount: number;
    newCount: number;
    duplicateCount: number;
    errors: unknown[];
    status: "running" | "done" | "failed";
  },
) {
  await db.jobSearchRun.updateMany({
    where: { id: runId, userId },
    data: {
      ...data,
      state: json(data.state),
      requestsByProvider: json(data.requestsByProvider),
      errors: json(data.errors),
      ...(data.status !== "running" && { finishedAt: new Date() }),
    },
  });
}
