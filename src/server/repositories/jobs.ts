import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Companies by matching key, created when new. Returns key → { id, isBlocked, isStaffingAgency }. */
export async function upsertCompanies(userId: string, companies: { name: string; key: string; isStaffing: boolean }[]) {
  const unique = [...new Map(companies.filter((c) => c.key).map((c) => [c.key, c])).values()];
  if (!unique.length) return new Map<string, { id: string; isBlocked: boolean; isStaffingAgency: boolean }>();
  await db.company.createMany({
    data: unique.map((c) => ({ userId, name: c.name, normalizedName: c.key, isStaffingAgency: c.isStaffing })),
    skipDuplicates: true,
  });
  const rows = await db.company.findMany({
    where: { userId, normalizedName: { in: unique.map((c) => c.key) } },
    select: { id: true, normalizedName: true, isBlocked: true, isStaffingAgency: true },
  });
  return new Map(rows.map((r) => [r.normalizedName, r]));
}

/** Existing jobs that might be duplicates of new ones: same provider ids, same companies or same descriptions. */
export async function findDedupeCandidates(
  userId: string,
  keys: { externalKeys: { provider: string; externalId: string }[]; companyIds: string[]; hashes: string[] },
) {
  return db.job.findMany({
    where: {
      userId,
      OR: [
        ...(keys.externalKeys.length
          ? keys.externalKeys.map((k) => ({ provider: k.provider, externalId: k.externalId }))
          : []),
        ...(keys.companyIds.length ? [{ companyId: { in: keys.companyIds } }] : []),
        ...(keys.hashes.length ? [{ descriptionHash: { in: keys.hashes } }] : []),
      ],
    },
    select: {
      id: true,
      provider: true,
      externalId: true,
      title: true,
      locationCity: true,
      descriptionHash: true,
      descriptionRaw: true,
      descriptionTruncated: true,
      postedAt: true,
      applyLinks: true,
      targetRoleIds: true,
      company: { select: { normalizedName: true } },
    },
  });
}

export type NewJobRow = Omit<Prisma.JobCreateManyInput, "userId">;

export async function createJobs(userId: string, rows: NewJobRow[]) {
  if (!rows.length) return 0;
  const { count } = await db.job.createMany({ data: rows.map((r) => ({ ...r, userId })), skipDuplicates: true });
  return count;
}

/** Merges a duplicate into an existing job: more apply links, more roles, possibly a fuller description. */
export function mergeIntoJob(
  userId: string,
  id: string,
  data: {
    applyLinks: unknown;
    targetRoleIds: string[];
    description?: { descriptionRaw: string; descriptionHash: string; descriptionTruncated: boolean };
    isDirectFromCompany?: boolean;
  },
) {
  return db.job.updateMany({
    where: { id, userId },
    data: {
      applyLinks: json(data.applyLinks),
      targetRoleIds: data.targetRoleIds,
      ...(data.description ?? {}),
      ...(data.isDirectFromCompany && { isDirectFromCompany: true }),
      // A changed description must be embedded again.
      ...(data.description && { embeddingModel: null, embeddedAt: null }),
    },
  });
}

export async function runBatch(statements: Prisma.PrismaPromise<unknown>[]) {
  if (statements.length) await db.$transaction(statements);
}

/** Jobs to rank, in pages. */
export async function listJobsForRanking(userId: string, afterId: string | null, take: number) {
  return db.job.findMany({
    where: { userId, ...(afterId && { id: { gt: afterId } }) },
    orderBy: { id: "asc" },
    take,
    select: {
      id: true,
      title: true,
      descriptionRaw: true,
      locationCity: true,
      workMode: true,
      salaryMinAnnual: true,
      salaryMaxAnnual: true,
      salaryDisclosed: true,
      salaryCurrency: true,
      expMinYears: true,
      expMaxYears: true,
      seniority: true,
      conditions: true,
    },
  });
}

export async function countJobs(userId: string) {
  return db.job.count({ where: { userId } });
}

/** Saves relevance scores in one statement. */
export async function saveScores(
  userId: string,
  rows: { id: string; score: number; parts: unknown; notFitReasons: string[] }[],
) {
  if (!rows.length) return;
  const values = rows.map(
    (r) => Prisma.sql`(${r.id}, ${r.score}::int, ${JSON.stringify(r.parts)}::jsonb, ${r.notFitReasons}::text[])`,
  );
  await db.$executeRaw`
    UPDATE jobs AS j
    SET "quickScore" = v.score, "scoreParts" = v.parts, "notFitReasons" = v.reasons, "updatedAt" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, score, parts, reasons)
    WHERE j.id = v.id AND j."userId" = ${userId}`;
}

/** The best matches a run found, for the summary under "Find jobs". */
export async function topJobsOfRun(userId: string, runId: string, take = 10) {
  return db.job.findMany({
    where: { userId, searchRunId: runId, notFitReasons: { isEmpty: true }, isStale: false },
    orderBy: [{ quickScore: { sort: "desc", nulls: "last" } }, { postedAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      companyName: true,
      locationCity: true,
      workMode: true,
      quickScore: true,
      scoreParts: true,
      salaryMinAnnual: true,
      salaryMaxAnnual: true,
      salaryDisclosed: true,
      provider: true,
      postedVia: true,
      postedAt: true,
      isDirectFromCompany: true,
      applyLinks: true,
      company: { select: { isStaffingAgency: true } },
    },
  });
}
