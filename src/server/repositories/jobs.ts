import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { FEED_GROUPS, type FeedFilters, type FeedGroup } from "@/lib/jobs/feed";
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
  if (statements.length) await db.$transaction(statements, { maxWait: 10_000, timeout: 30_000 });
}

/** Jobs to rank, in pages. */
export async function listJobsForRanking(userId: string, afterId: string | null, take: number, ids?: string[]) {
  return db.job.findMany({
    where: { userId, ...(afterId && { id: { gt: afterId } }), ...(ids && { id: { in: ids } }) },
    orderBy: { id: "asc" },
    take,
    select: {
      id: true,
      companyId: true,
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
    SET "quickScore" = v.score, "scoreParts" = v.parts, "notFitReasons" = v.reasons,
        -- An analysed job keeps sorting by its Fit score.
        "sortScore" = COALESCE(j."fitScore", v.score), "updatedAt" = now()
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

/** Dismiss reasons so far (they tune ranking) and the companies dismissed for the reason "company". */
export async function dismissalStats(userId: string) {
  const [reasons, companies] = await Promise.all([
    db.job.groupBy({
      by: ["dismissReason"],
      where: { userId, feedStatus: "dismissed", dismissReason: { not: null } },
      _count: { _all: true },
    }),
    db.job.findMany({
      where: { userId, feedStatus: "dismissed", dismissReason: "company", companyId: { not: null } },
      select: { companyId: true },
      distinct: ["companyId"],
    }),
  ]);
  return {
    reasons: Object.fromEntries(reasons.map((r) => [r.dismissReason!, r._count._all])) as Record<string, number>,
    companyIds: companies.map((c) => c.companyId!),
  };
}

/** Jobs posted (or, without a date, found) since `since`, for per-role market stats. */
export async function jobsForRoleStats(userId: string, since: Date) {
  return db.job.findMany({
    where: {
      userId,
      isStale: false,
      OR: [{ postedAt: { gte: since } }, { postedAt: null, discoveredAt: { gte: since } }],
    },
    select: { targetRoleIds: true, quickScore: true, scoreParts: true },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// "For you" feed (SPEC §10.6)

const notDismissed: Prisma.JobWhereInput = { feedStatus: { not: "dismissed" } };
const cleanCompany: Prisma.JobWhereInput = {
  OR: [{ companyId: null }, { company: { isStaffingAgency: false, isBlocked: false } }],
};

/** Each group's condition. A job hidden for any reason stays out of "For you"; the hidden groups may overlap. */
function groupWhere(group: FeedGroup): Prisma.JobWhereInput {
  switch (group) {
    case "for_you":
      return { AND: [notDismissed, { notFitReasons: { isEmpty: true } }, { isStale: false }, cleanCompany] };
    case "saved":
      return { feedStatus: "saved" };
    case "not_fit":
      return { AND: [notDismissed, { NOT: { notFitReasons: { isEmpty: true } } }] };
    case "stale":
      return { AND: [notDismissed, { isStale: true }] };
    case "agency":
      return { AND: [notDismissed, { company: { isStaffingAgency: true } }] };
    case "blocked":
      return { AND: [notDismissed, { company: { isBlocked: true } }] };
    case "dismissed":
      return { feedStatus: "dismissed" };
  }
}

function feedWhere(userId: string, filters: FeedFilters, now: Date): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = [groupWhere(filters.group)];
  if (filters.roleId) and.push({ targetRoleIds: { has: filters.roleId } });
  if (filters.city) and.push({ locationCity: filters.city });
  if (filters.workMode) and.push({ workMode: filters.workMode });
  if (filters.postedWithinDays) {
    and.push({ postedAt: { gte: new Date(now.getTime() - filters.postedWithinDays * 86_400_000) } });
  }
  if (filters.provider) and.push({ provider: filters.provider });
  if (filters.directOnly) and.push({ isDirectFromCompany: true });
  if (filters.analysedOnly) and.push({ fitScore: { not: null } });
  if (filters.salaryMinAnnual) and.push({ salaryDisclosed: true, salaryMaxAnnual: { gte: filters.salaryMinAnnual } });
  return { userId, AND: and };
}

export const FEED_PAGE_SIZE = 20;

export async function listFeed(userId: string, filters: FeedFilters, page: number, now = new Date()) {
  const where = feedWhere(userId, filters, now);
  const [jobs, total] = await Promise.all([
    db.job.findMany({
      where,
      orderBy: [
        { sortScore: { sort: "desc", nulls: "last" } },
        { postedAt: { sort: "desc", nulls: "last" } },
        { id: "asc" },
      ],
      skip: (page - 1) * FEED_PAGE_SIZE,
      take: FEED_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        companyId: true,
        companyName: true,
        locationCity: true,
        workMode: true,
        salaryMinAnnual: true,
        salaryMaxAnnual: true,
        salaryDisclosed: true,
        provider: true,
        postedVia: true,
        postedAt: true,
        discoveredAt: true,
        isDirectFromCompany: true,
        isStale: true,
        applyLinks: true,
        quickScore: true,
        scoreParts: true,
        fitScore: true,
        fitRecommendation: true,
        notFitReasons: true,
        feedStatus: true,
        dismissReason: true,
        company: { select: { isStaffingAgency: true, isBlocked: true } },
      },
    }),
    db.job.count({ where }),
  ]);
  return { jobs, total };
}

/** How many jobs each group holds (other filters ignored), for the group tabs. */
export async function feedCounts(userId: string) {
  const counts = await Promise.all(
    FEED_GROUPS.map((group) => db.job.count({ where: { userId, ...groupWhere(group) } })),
  );
  return Object.fromEntries(FEED_GROUPS.map((group, i) => [group, counts[i]])) as Record<FeedGroup, number>;
}

/** Values for the filter menus: the cities and sources among the user's jobs. */
export async function feedFacets(userId: string) {
  const [cities, providers] = await Promise.all([
    db.job.groupBy({ by: ["locationCity"], where: { userId, locationCity: { not: null } }, _count: { _all: true } }),
    db.job.groupBy({ by: ["provider"], where: { userId }, _count: { _all: true } }),
  ]);
  return {
    cities: cities.sort((a, b) => b._count._all - a._count._all).map((c) => c.locationCity!),
    providers: providers.map((p) => p.provider).sort(),
  };
}

export async function setFeedStatus(
  userId: string,
  ids: string[],
  status: "new" | "saved" | "dismissed",
  dismissReason: string | null = null,
) {
  const { count } = await db.job.updateMany({
    where: { userId, id: { in: ids } },
    data: { feedStatus: status, dismissReason: status === "dismissed" ? dismissReason : null },
  });
  return count;
}

export async function setCompanyBlocked(userId: string, companyId: string, blocked: boolean) {
  const { count } = await db.company.updateMany({ where: { id: companyId, userId }, data: { isBlocked: blocked } });
  return count === 1;
}

/** A job's description and apply links, for replacing a cut-off description. */
export async function getJobDescription(userId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, descriptionRaw: true, descriptionTruncated: true, applyLinks: true, title: true },
  });
}

/**
 * Replaces a job's description (pasted or read from its page). The extraction and Fit analysis follow the new
 * description hash; the vector is cleared so the job is embedded again.
 */
export async function updateJobDescription(
  userId: string,
  jobId: string,
  data: {
    descriptionRaw: string;
    descriptionHash: string;
    conditions: unknown;
    expMinYears: number | null;
    expMaxYears: number | null;
  },
) {
  const { count } = await db.job.updateMany({
    where: { id: jobId, userId },
    data: {
      descriptionRaw: data.descriptionRaw,
      descriptionHash: data.descriptionHash,
      descriptionTruncated: false,
      conditions: json(data.conditions),
      expMinYears: data.expMinYears,
      expMaxYears: data.expMaxYears,
      embeddingModel: null,
      embeddedAt: null,
    },
  });
  return count === 1;
}

export async function createJob(userId: string, row: NewJobRow) {
  return db.job.create({ data: { ...row, userId }, select: { id: true } });
}

/** One job for its page. */
export async function getJobDetail(userId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, userId },
    select: {
      id: true,
      title: true,
      companyName: true,
      companyId: true,
      location: true,
      locationCity: true,
      workMode: true,
      employmentType: true,
      salaryMinAnnual: true,
      salaryMaxAnnual: true,
      salaryDisclosed: true,
      provider: true,
      origin: true,
      postedVia: true,
      postedAt: true,
      discoveredAt: true,
      applyLinks: true,
      descriptionRaw: true,
      descriptionTruncated: true,
      isDirectFromCompany: true,
      isStale: true,
      quickScore: true,
      scoreParts: true,
      fitScore: true,
      fitRecommendation: true,
      notFitReasons: true,
      feedStatus: true,
      injectionSuspected: true,
      company: { select: { isStaffingAgency: true, isBlocked: true } },
    },
  });
}

/** The run's best new matches without a Fit Report yet, for automatic analysis. */
export async function jobsToAnalyse(userId: string, runId: string, take: number) {
  if (take <= 0) return [];
  return db.job.findMany({
    where: { userId, searchRunId: runId, notFitReasons: { isEmpty: true }, isStale: false, fitScore: null },
    orderBy: [{ quickScore: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take,
    select: { id: true },
  });
}
