import "server-only";
import type { AiRunner } from "@/lib/ai/runner";
import { readAtsBoard, type AtsContext } from "@/lib/careersites/adapters";
import { ATS_KINDS, type AtsKind, type SiteRef } from "@/lib/careersites/ats";
import { titleMatches, wantPosting, type PostingFilter, type SitePosting } from "@/lib/careersites/postings";
import { readCareersPage, type PageRead } from "@/lib/careersites/reader";
import { AppError, isAppError } from "@/lib/errors";
import { fetchJson } from "@/lib/jobsearch/http";
import { ProviderHttpError } from "@/lib/jobsearch/types";
import { canonicalCity } from "@/lib/jobs/normalize";
import { fetchPublicPage, type FetchDeps } from "@/lib/web/fetch-page";
import { createHostThrottle, type HostThrottle } from "@/lib/web/links";
import { USER_AGENT } from "@/lib/web/robots";
import { listJobsWithAi } from "@/server/ai/career-page-extractor";
import { ai } from "@/server/ai/runner";
import { deleteCareerSite, findCareerSite, getCareerSite, updateCareerSite } from "@/server/repositories/career-sites";
import { getCareerProfile } from "@/server/repositories/profile";
import { listTargetRoles } from "@/server/repositories/target-roles";

const DAY = 86_400_000;
/** After this many runs in a row without a relevant job, a site is checked weekly (SPEC §11.4). */
const EMPTY_RUNS_BEFORE_WEEKLY = 3;
/** After this many failures in a row, a site is marked failed (it is still retried, with a growing pause). */
const FAILURES_BEFORE_FAILED = 3;

export type ReaderDeps = FetchDeps & { runner?: AiRunner; throttle?: HostThrottle };

/** What a run reads with: the user's roles and places as a filter, one throttle and one page budget. */
export async function readerContext(userId: string, now: Date) {
  const [roles, career] = await Promise.all([listTargetRoles(userId), getCareerProfile(userId)]);
  const selected = roles.filter((r) => r.selected);
  const filter: PostingFilter = {
    titleVariants: [...new Set(selected.flatMap((r) => [r.title, ...r.titleVariants]))],
    cities: [
      ...new Set((career?.preferredLocations ?? []).map(canonicalCity).filter((c): c is string => Boolean(c))),
    ].filter((c) => c !== "Remote-India"),
    remoteOk: (career?.workModes ?? []).includes("remote"),
    now,
  };
  return { filter, roles: selected.map((r) => ({ id: r.id, title: r.title, titleVariants: r.titleVariants })) };
}

export type SiteReadResult = {
  siteId: string;
  method: PageRead["method"] | "ats";
  postings: SitePosting[];
  total: number;
  /** Every posting id an ATS board lists (null for careers pages and failed reads): the rest have closed. */
  openIds: string[] | null;
  status: string;
  error: string | null;
};

/**
 * Reads one career site (SPEC §11.3): an ATS board through its keyless API, otherwise the careers page (embedded
 * board, JSON-LD, linked job pages, then CareerPageExtractor). Updates the registry: counts, status and the next
 * check (daily; weekly after 3 empty runs; failures back off; robots.txt refusals wait 30 days).
 */
export async function readCareerSite(
  userId: string,
  siteId: string,
  options: { now?: Date; budget?: { pages: number }; filter?: PostingFilter; deps?: ReaderDeps } = {},
): Promise<SiteReadResult> {
  const now = options.now ?? new Date();
  const site = await getCareerSite(userId, siteId);
  if (!site) throw new AppError("NOT_FOUND");
  if (!site.url || site.kind === "unknown")
    throw new AppError("VALIDATION", { message: "This site hasn't been found yet." });
  // The known company's name ("Kestrel Pay"), so postings merge with the same job from job sites.
  const company = site.company?.name ?? site.name;
  const filter = options.filter ?? (await readerContext(userId, now)).filter;
  const budget = options.budget ?? { pages: 20 };
  const deps = options.deps ?? {};
  const throttle = deps.throttle ?? createHostThrottle();
  const fetchImpl = deps.fetch ?? fetch;

  const ctx: AtsContext = {
    async getJson<T>(url: string) {
      await throttle(url);
      return fetchJson<T>(new URL(url).hostname, url, {
        fetch: fetchImpl,
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
      });
    },
    want: (p) => wantPosting(p, filter),
    budget,
  };

  // The registry row this read is recorded on (changes when a careers page turns out to be a known board).
  let targetId = site.id;
  try {
    let read: { postings: SitePosting[]; total: number; method: SiteReadResult["method"]; openIds: string[] | null };
    let ats: SiteRef | null = ATS_KINDS.includes(site.kind as AtsKind)
      ? { kind: site.kind as AtsKind, token: site.boardToken!, url: site.url, key: site.key }
      : null;
    if (!ats) {
      const page = await readCareersPage(site.url, {
        fetchPage: async (url) => {
          await throttle(url);
          return fetchPublicPage(url, deps);
        },
        listJobs: (input) => listJobsWithAi(deps.runner ?? ai, input, userId),
        want: ctx.want,
        wantTitle: (title) => titleMatches(title, filter.titleVariants),
        budget,
        company,
      });
      if (page.embedded) {
        // The careers page embeds an ATS board: from now on the site is that board (or merges into it if known).
        ats = page.embedded;
        const known = await findCareerSite(userId, ats.key);
        if (known) {
          await deleteCareerSite(userId, site.id);
          targetId = known.id;
        } else {
          await updateCareerSite(userId, site.id, {
            kind: ats.kind,
            boardToken: ats.token,
            url: ats.url,
            key: ats.key,
          });
        }
      } else {
        // A careers page is read within a page budget, so a job missing from it may just not have been reached.
        read = { postings: page.postings, total: page.total, method: page.method, openIds: null };
      }
    }
    if (ats) {
      const board = await readAtsBoard(ats.kind as AtsKind, ats.token!, company, ctx);
      read = { postings: board.postings, total: board.total, method: "ats", openIds: board.openIds };
    }
    const result = read!;
    const emptyRuns = result.postings.length ? 0 : site.emptyRuns + 1;
    const status = emptyRuns >= EMPTY_RUNS_BEFORE_WEEKLY ? "no_relevant_jobs" : "active";
    await updateCareerSite(userId, targetId, {
      status,
      lastFetchedAt: now,
      nextCheckAt: new Date(now.getTime() + (status === "no_relevant_jobs" ? 7 : 1) * DAY),
      lastJobCount: result.total,
      relevantJobCount: result.postings.length,
      emptyRuns,
      failures: 0,
      lastError: null,
    });
    return { siteId: targetId, ...result, status, error: null };
  } catch (error) {
    const robots = isAppError(error) && error.code === "FETCH_BLOCKED_BY_ROBOTS";
    const failures = site.failures + 1;
    const status = robots ? "blocked_by_robots" : failures >= FAILURES_BEFORE_FAILED ? "failed" : site.status;
    const http = isProviderHttpError(error) ? `The site answered ${error.status}.` : null;
    const message = isAppError(error) ? error.message : (http ?? "The site couldn't be read.");
    await updateCareerSite(userId, targetId, {
      status,
      lastFetchedAt: now,
      // Back off: 1, 2, 4… days (at most 30); a robots.txt refusal is respected for 30 days.
      nextCheckAt: new Date(now.getTime() + (robots ? 30 : Math.min(30, 2 ** (failures - 1))) * DAY),
      failures,
      lastError: message.slice(0, 300),
    });
    if (!isAppError(error) && !http) console.error("career site read failed", error);
    return { siteId: targetId, method: "none", postings: [], total: 0, openIds: null, status, error: message };
  }
}

/** Recognised by shape: the class can be loaded twice by bundlers and test runners. */
function isProviderHttpError(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError || (error as { name?: string } | null)?.name === "ProviderHttpError";
}
