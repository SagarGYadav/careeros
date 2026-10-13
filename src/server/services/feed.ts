import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { formatSalaryRange } from "@/lib/format";
import {
  RANKING_REASONS,
  topGap,
  topReasons,
  type DismissReason,
  type FeedGroup,
  type FeedQuery,
} from "@/lib/jobs/feed";
import type { ScorePart } from "@/lib/jobs/relevance";
import {
  FEED_PAGE_SIZE,
  countJobs,
  feedCounts,
  feedFacets,
  listFeed,
  setCompanyBlocked,
  setFeedStatus,
} from "@/server/repositories/jobs";
import { getCareerProfile, setFeedSeenAt } from "@/server/repositories/profile";
import { listRunsSince } from "@/server/repositories/search-runs";
import { listTargetRoles } from "@/server/repositories/target-roles";
import { linksOf, rescoreAllJobs } from "./search-runs";

/** One job card in the feed. Dates are ISO strings so the card can render on the client. */
export type FeedCard = {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string;
  city: string | null;
  workMode: string | null;
  salary: string | null;
  provider: string;
  postedVia: string | null;
  postedAt: string | null;
  isNew: boolean;
  direct: boolean;
  staffing: boolean;
  companyBlocked: boolean;
  stale: boolean;
  score: number | null;
  parts: ScorePart[];
  adjustments: { points: number; reason: string }[];
  reasons: string[];
  gap: string | null;
  notFitReasons: string[];
  status: "new" | "saved" | "dismissed";
  dismissReason: string | null;
  applyUrl: string | null;
  applySite: string | null;
};

const scorePartsSchema = z
  .object({
    parts: z.array(z.custom<ScorePart>((v) => typeof v === "object" && v !== null && "key" in v)),
    adjustments: z.array(z.object({ points: z.number(), reason: z.string() })).catch([]),
  })
  .catch({ parts: [], adjustments: [] });

const feedStatusSchema = z.enum(["new", "saved", "dismissed"]).catch("new");

export async function getFeed(userId: string, query: FeedQuery, now = new Date()) {
  const [{ jobs, total }, counts, facets, roles, career, jobCount] = await Promise.all([
    listFeed(userId, query.filters, query.page, now),
    feedCounts(userId),
    feedFacets(userId),
    listTargetRoles(userId),
    getCareerProfile(userId),
    countJobs(userId),
  ]);
  // Before the first visit nothing is "new": every job would be, which tells the user nothing.
  const seenAt = career?.feedSeenAt ?? null;
  const cards: FeedCard[] = jobs.map((job) => {
    const { parts, adjustments } = scorePartsSchema.parse(job.scoreParts);
    const links = linksOf(job.applyLinks);
    return {
      id: job.id,
      title: job.title,
      companyId: job.companyId,
      companyName: job.companyName,
      city: job.locationCity,
      workMode: job.workMode,
      salary: job.salaryDisclosed ? formatSalaryRange(job.salaryMinAnnual, job.salaryMaxAnnual) : null,
      provider: job.provider,
      postedVia: job.postedVia,
      postedAt: job.postedAt?.toISOString() ?? null,
      isNew: Boolean(seenAt && job.discoveredAt > seenAt),
      direct: job.isDirectFromCompany,
      staffing: job.company?.isStaffingAgency ?? false,
      companyBlocked: job.company?.isBlocked ?? false,
      stale: job.isStale,
      score: job.quickScore,
      parts,
      adjustments,
      reasons: topReasons(parts),
      gap: topGap(parts),
      notFitReasons: job.notFitReasons,
      status: feedStatusSchema.parse(job.feedStatus),
      dismissReason: job.dismissReason,
      applyUrl: links[0]?.url ?? null,
      applySite: links[0]?.site ?? null,
    };
  });
  return {
    cards,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / FEED_PAGE_SIZE)),
    counts: counts as Record<FeedGroup, number>,
    facets,
    roles: roles.map((role) => ({ id: role.id, title: role.title })),
    hasJobs: jobCount > 0,
  };
}

export type FeedView = Awaited<ReturnType<typeof getFeed>>;

export async function markFeedSeen(userId: string, at = new Date()) {
  await setFeedSeenAt(userId, at);
}

/** Dismisses jobs; reasons that tune ranking re-score every job so the feed reflects them at once. */
export async function dismissJobs(userId: string, ids: string[], reason: DismissReason | null) {
  const count = await setFeedStatus(userId, ids, "dismissed", reason);
  if (!count) throw new AppError("NOT_FOUND");
  if (reason && RANKING_REASONS.includes(reason)) await rescoreAllJobs(userId);
  return count;
}

/** Puts dismissed jobs back; re-scores, because their reasons no longer count. */
export async function restoreJobs(userId: string, ids: string[]) {
  const count = await setFeedStatus(userId, ids, "new");
  if (!count) throw new AppError("NOT_FOUND");
  await rescoreAllJobs(userId);
  return count;
}

export async function setJobsSaved(userId: string, ids: string[], saved: boolean) {
  const count = await setFeedStatus(userId, ids, saved ? "saved" : "new");
  if (!count) throw new AppError("NOT_FOUND");
  return count;
}

export async function blockCompany(userId: string, companyId: string, blocked: boolean) {
  if (!(await setCompanyBlocked(userId, companyId, blocked))) throw new AppError("NOT_FOUND");
}

/** Job-search use this calendar month (UTC): runs, requests per provider and what they found. */
export async function getSearchUsage(userId: string, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const runs = await listRunsSince(userId, monthStart);
  const requests: Record<string, number> = {};
  for (const run of runs) {
    const byProvider = z.record(z.string(), z.number()).catch({}).parse(run.requestsByProvider);
    for (const [provider, count] of Object.entries(byProvider)) requests[provider] = (requests[provider] ?? 0) + count;
  }
  return {
    runs: runs.length,
    finishedRuns: runs.filter((run) => run.status === "done").length,
    requests,
    found: runs.reduce((sum, run) => sum + run.resultCount, 0),
    newJobs: runs.reduce((sum, run) => sum + run.newCount, 0),
  };
}
