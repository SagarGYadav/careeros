import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function createResumeVersion(
  userId: string,
  data: { name: string; fileId: string; parentId?: string | null },
) {
  return db.resumeVersion.create({
    data: { userId, name: data.name, fileId: data.fileId, parentId: data.parentId ?? null, parseStatus: "uploaded" },
  });
}

/** Saves the pipeline's result: text, links, verified draft, evidence catalog and verification report. */
export async function saveResumeParse(
  userId: string,
  resumeId: string,
  data: {
    extractedText: string;
    pageCount: number | null;
    links: unknown;
    parsed: unknown;
    evidence: unknown;
    verification: unknown;
    parseMode: string;
    parseProvider: string | null;
    injectionSuspected: boolean;
  },
) {
  const { count } = await db.resumeVersion.updateMany({
    where: { id: resumeId, userId },
    data: {
      extractedText: data.extractedText,
      pageCount: data.pageCount,
      links: json(data.links),
      parsed: json(data.parsed),
      evidence: json(data.evidence),
      verification: json(data.verification),
      parseStatus: "parsed",
      parseMode: data.parseMode,
      parseProvider: data.parseProvider,
      injectionSuspected: data.injectionSuspected,
    },
  });
  return count === 1;
}

export async function markResumeFailed(userId: string, resumeId: string) {
  await db.resumeVersion.updateMany({ where: { id: resumeId, userId }, data: { parseStatus: "failed" } });
}

export async function getResumeVersion(userId: string, resumeId: string) {
  return db.resumeVersion.findFirst({ where: { id: resumeId, userId } });
}

export async function listResumeVersions(userId: string) {
  return db.resumeVersion.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      parseStatus: true,
      parseMode: true,
      isDefault: true,
      confirmedAt: true,
      createdAt: true,
      file: { select: { fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
}
