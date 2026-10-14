import "server-only";
import { z } from "zod";
import { detectSite, nameFromTitle, nameFromToken, type SiteRef } from "@/lib/careersites/ats";
import { buildDiscoveryQueries, type DiscoveryQuery } from "@/lib/careersites/discovery";
import { AppError, isAppError } from "@/lib/errors";
import { canonicalCity, companyKey } from "@/lib/jobs/normalize";
import { checkUrl } from "@/lib/web/ssrf";
import type { WebSearchRunner } from "@/lib/websearch/runner";
import {
  addDiscoveredSites,
  companiesByKey,
  companiesWithoutSites,
  createCareerSite,
  deleteCareerSite,
  findCareerSite,
  listCareerSites,
  markSiteAsUsers,
  resolveWatchlistName,
  type NewCareerSite,
} from "@/server/repositories/career-sites";
import { getCareerProfile } from "@/server/repositories/profile";
import { listTargetRoles } from "@/server/repositories/target-roles";
import { webSearch } from "@/server/websearch/runner";

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** Web searches per discovery (SPEC §11.4: ≤ 20 per run, within each provider's quota). */
export const MAX_WEB_SEARCHES = () => num(process.env.DEEP_SEARCH_MAX_WEB_SEARCHES_PER_RUN, 20);
/** Companies from job-site results looked up per discovery. */
const SEEN_COMPANIES_PER_RUN = 3;

const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A search for one company accepts only sites whose host or board token resembles its name. */
function belongsTo(site: SiteRef, company: string): boolean {
  const name = letters(companyKey(company));
  if (name.length < 3) return false;
  const host = letters(new URL(site.url).hostname.replace(/^www\./, ""));
  return host.includes(name) || (site.token !== null && letters(site.token).includes(name.slice(0, 12)));
}

export type DiscoverySummary = {
  searches: number;
  sitesSeen: number;
  newSites: number;
  resolvedWatchlist: number;
  providers: Record<string, number>;
  /** Why discovery stopped early, if it did (quota used up, no provider set up). */
  stoppedBecause: string | null;
};

/**
 * Finds company career sites with web searches (SPEC §11.2): ATS boards for the selected roles and places,
 * companies already seen in job-site results, and watchlist names. New sites join the registry.
 */
export async function discoverCareerSites(
  userId: string,
  options: { runner?: WebSearchRunner; maxSearches?: number } = {},
): Promise<DiscoverySummary> {
  const runner = options.runner ?? webSearch;
  const [roles, career, sites, seen] = await Promise.all([
    listTargetRoles(userId),
    getCareerProfile(userId),
    listCareerSites(userId),
    companiesWithoutSites(userId, SEEN_COMPANIES_PER_RUN),
  ]);
  const selected = roles.filter((r) => r.selected);
  if (!selected.length && !sites.some((s) => s.status === "unresolved")) {
    throw new AppError("VALIDATION", { message: "Select at least one target role to discover company sites for it." });
  }
  const cities = [
    ...new Set((career?.preferredLocations ?? []).map(canonicalCity).filter((c): c is string => Boolean(c))),
  ].filter((c) => c !== "Remote-India");
  const locations = (career?.workModes ?? []).includes("remote") ? [...cities, "Remote"] : cities;
  const unresolved = sites.filter((s) => s.status === "unresolved");
  const queries = buildDiscoveryQueries({
    titles: selected.map((r) => r.titleVariants[0] ?? r.title),
    locations: locations.slice(0, 3),
    watchlistNames: unresolved.map((s) => s.name),
    seenCompanies: seen.map((c) => c.name),
    max: options.maxSearches ?? MAX_WEB_SEARCHES(),
  });

  const summary: DiscoverySummary = {
    searches: 0,
    sitesSeen: 0,
    newSites: 0,
    resolvedWatchlist: 0,
    providers: {},
    stoppedBecause: null,
  };
  const found = new Map<string, NewCareerSite>();
  for (const query of queries) {
    let hits;
    try {
      const result = await runner.search(query);
      summary.searches++;
      summary.providers[result.provider] = (summary.providers[result.provider] ?? 0) + result.requestsUsed;
      hits = result.hits;
    } catch (error) {
      if (isAppError(error) && (error.code === "SEARCH_QUOTA_EXCEEDED" || error.code === "SEARCH_NOT_CONFIGURED")) {
        summary.stoppedBecause = error.message;
        break;
      }
      throw error;
    }
    for (const hit of hits) {
      const site = detectSite(hit.url);
      if (!site) continue;
      if ((query.purpose === "company" || query.purpose === "watchlist") && !belongsTo(site, query.company!)) continue;
      summary.sitesSeen++;
      if (query.purpose === "watchlist") {
        const entry = unresolved.find((s) => s.name === query.company);
        if (entry && entry.status === "unresolved") {
          await resolveWatchlistName(userId, entry.id, siteRow(site, query.company!, query));
          entry.status = "active";
          summary.resolvedWatchlist++;
        }
        continue;
      }
      if (!found.has(site.key)) {
        const name =
          query.company ??
          nameFromTitle(hit.title) ??
          (site.token ? nameFromToken(site.token) : new URL(site.url).hostname);
        found.set(site.key, { ...siteRow(site, name, query), source: "discovered" });
      }
    }
  }
  // Link to companies already known from job-site results.
  const rows = [...found.values()];
  const companyIds = await companiesByKey(userId, [...new Set(rows.map((r) => companyKey(r.name)))]);
  summary.newSites = await addDiscoveredSites(
    userId,
    rows.map((r) => ({ ...r, companyId: companyIds.get(companyKey(r.name)) ?? null })),
  );
  return summary;
}

function siteRow(site: SiteRef, name: string, query: DiscoveryQuery): Omit<NewCareerSite, "source"> {
  return {
    key: site.key,
    kind: site.kind,
    boardToken: site.token,
    url: site.url,
    name: name.slice(0, 120),
    discoveredFrom:
      `${query.query}${query.includeDomains?.length ? ` (${query.includeDomains.join(", ")})` : ""}`.slice(0, 300),
  };
}

const watchlistInput = z.object({
  value: z.string().trim().min(2, "Enter a company name or its careers page link.").max(300),
});

/**
 * Watchlist (SPEC §11.2): a careers link is classified now (ATS board or careers page); a company name is kept and
 * found by the next discovery.
 */
export async function addToWatchlist(userId: string, input: unknown) {
  const { value } = watchlistInput.parse(input);
  const looksLikeUrl = /^https?:\/\//i.test(value) || (/^[^\s]+\.[a-z]{2,}(\/|$)/i.test(value) && !/\s/.test(value));
  if (looksLikeUrl) {
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const check = checkUrl(raw);
    if (!check.ok) throw new AppError("URL_FETCH_BLOCKED", { message: check.reason });
    const detected = detectSite(raw);
    // A link the user gives is a careers page even if its path doesn't say so.
    const site: SiteRef = detected ?? {
      kind: "html",
      token: null,
      url: `https://${check.url.hostname}${check.url.pathname.replace(/\/$/, "")}`,
      key: `html:${check.url.hostname}${check.url.pathname.replace(/\/$/, "").toLowerCase()}`,
    };
    const existing = await findCareerSite(userId, site.key);
    if (existing) {
      await markSiteAsUsers(userId, existing.id);
      return { id: existing.id, created: false };
    }
    const name = site.token ? nameFromToken(site.token) : check.url.hostname.replace(/^(www|careers|jobs)\./, "");
    const created = await createCareerSite(userId, {
      key: site.key,
      kind: site.kind,
      boardToken: site.token,
      url: site.url,
      name,
      source: "user",
    });
    return { id: created.id, created: true };
  }
  const key = `name:${companyKey(value) || value.toLowerCase()}`;
  const existing = await findCareerSite(userId, key);
  if (existing) return { id: existing.id, created: false };
  const created = await createCareerSite(userId, {
    key,
    kind: "unknown",
    boardToken: null,
    url: null,
    name: value,
    source: "user",
    status: "unresolved",
  });
  return { id: created.id, created: true };
}

export async function removeCareerSite(userId: string, id: string) {
  if (!(await deleteCareerSite(userId, id))) throw new AppError("NOT_FOUND");
}

export type CareerSiteView = {
  id: string;
  name: string;
  company: string | null;
  kind: string;
  url: string | null;
  source: "discovered" | "user";
  status: string;
  discoveredFrom: string | null;
  lastFetchedAt: string | null;
  lastJobCount: number;
  relevantJobCount: number;
  lastError: string | null;
};

export async function listCareerSitesView(userId: string): Promise<CareerSiteView[]> {
  const sites = await listCareerSites(userId);
  return sites.map((s) => ({
    id: s.id,
    name: s.name,
    company: s.company?.name ?? null,
    kind: s.kind,
    url: s.url,
    source: s.source === "user" ? "user" : "discovered",
    status: s.status,
    discoveredFrom: s.discoveredFrom,
    lastFetchedAt: s.lastFetchedAt?.toISOString() ?? null,
    lastJobCount: s.lastJobCount,
    relevantJobCount: s.relevantJobCount,
    lastError: s.lastError,
  }));
}
