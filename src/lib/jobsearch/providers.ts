// Real job-search providers (SPEC §10.3, §7.2). Free tiers only; limits sit a little below each published quota
// (checked 2026-10-13) and can be lowered in .env.
import { fetchJson } from "./http";
import { ProviderHttpError } from "./types";
import type { ApplyLink, DatePosted, JobSearchProvider, NormalizedJob } from "./types";

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const DAYS: Record<DatePosted, number> = { day: 1, "3days": 3, week: 7, month: 30 };

const COUNTRY_NAMES: Record<string, string> = {
  in: "India",
  gb: "United Kingdom",
  us: "United States",
  sg: "Singapore",
};

/** Strips HTML tags and entities from snippets (Jooble returns highlighted HTML). */
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const isRemote = (location: string) => /^remote/i.test(location.trim());

// ---------------------------------------------------------------------------------------------------------------
// Adzuna (main): volume and salaries; descriptions are cut to about 500 characters.

type AdzunaResponse = {
  count: number;
  results: {
    id: string;
    title: string;
    description: string;
    created: string;
    redirect_url: string;
    salary_min?: number;
    salary_max?: number;
    salary_is_predicted?: string;
    contract_time?: string;
    contract_type?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
  }[];
};

const ADZUNA_PAGE_SIZE = 50;

export function adzunaProvider(env: Env, fetchImpl: Fetch = fetch): JobSearchProvider {
  const appId = env.ADZUNA_APP_ID;
  const appKey = env.ADZUNA_APP_KEY;
  return {
    name: "adzuna",
    label: "Adzuna",
    configured: Boolean(appId && appKey),
    // Published: 25 a minute, 250 a day, 2,500 a month.
    limits: { minute: 20, day: 225, month: num(env.ADZUNA_MONTHLY_QUOTA, 2250) },
    async search(params) {
      const page = Number(params.page ?? "1");
      const query = new URLSearchParams({
        app_id: appId ?? "",
        app_key: appKey ?? "",
        what: isRemote(params.location) ? `${params.query} remote` : params.query,
        results_per_page: String(ADZUNA_PAGE_SIZE),
        "content-type": "application/json",
      });
      if (!isRemote(params.location)) query.set("where", params.location);
      if (params.datePosted) query.set("max_days_old", String(DAYS[params.datePosted]));
      if (params.salaryMin) query.set("salary_min", String(params.salaryMin));
      const data = await fetchJson<AdzunaResponse>(
        "adzuna",
        `https://api.adzuna.com/v1/api/jobs/${params.country}/search/${page}?${query}`,
        { fetch: fetchImpl },
      );
      const jobs: NormalizedJob[] = data.results.map((r) => ({
        provider: "adzuna",
        externalId: r.id,
        title: r.title,
        company: r.company?.display_name ?? "",
        location: r.location?.display_name ?? "",
        description: plainText(r.description ?? ""),
        descriptionTruncated: true,
        salaryText: null,
        salaryMin: r.salary_min ?? null,
        salaryMax: r.salary_max ?? null,
        salaryEstimated: r.salary_is_predicted === "1",
        employmentType:
          r.contract_time === "part_time"
            ? "Part-time"
            : r.contract_type === "contract"
              ? "Contract"
              : r.contract_time
                ? "Full-time"
                : null,
        workModeHint: isRemote(params.location) ? "remote" : null,
        postedAt: r.created ? new Date(r.created) : null,
        postedVia: "Adzuna",
        applyLinks: [{ site: "Adzuna", url: r.redirect_url }],
      }));
      const more = data.results.length === ADZUNA_PAGE_SIZE && page * ADZUNA_PAGE_SIZE < data.count;
      return { jobs, nextPage: more ? String(page + 1) : undefined, requestsUsed: 1 };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Jooble (backup 1): snippets only. In India it filters by country, not city, so the city goes into the keywords.

type JoobleResponse = {
  totalCount: number;
  jobs: {
    id: number | string;
    title: string;
    location: string;
    snippet: string;
    salary: string;
    source: string;
    type: string;
    link: string;
    company: string;
    updated: string;
  }[];
};

const JOOBLE_PAGE_SIZE = 20;

export function joobleProvider(env: Env, fetchImpl: Fetch = fetch): JobSearchProvider {
  const key = env.JOOBLE_API_KEY;
  return {
    name: "jooble",
    label: "Jooble",
    configured: Boolean(key),
    limits: { day: num(env.JOOBLE_DAILY_QUOTA, 100) },
    async search(params) {
      const page = Number(params.page ?? "1");
      const remote = isRemote(params.location);
      const body = {
        keywords: [params.query, remote ? "remote" : params.location].join(" "),
        location: COUNTRY_NAMES[params.country] ?? params.country,
        page: String(page),
        ...(params.salaryMin && { salary: params.salaryMin }),
      };
      const data = await fetchJson<JoobleResponse>("jooble", `https://jooble.org/api/${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        fetch: fetchImpl,
      });
      const jobs: NormalizedJob[] = (data.jobs ?? []).map((j) => ({
        provider: "jooble",
        externalId: String(j.id),
        title: plainText(j.title),
        company: j.company ?? "",
        location: j.location ?? "",
        description: plainText(j.snippet ?? ""),
        descriptionTruncated: true,
        salaryText: j.salary || null,
        salaryMin: null,
        salaryMax: null,
        salaryEstimated: false,
        employmentType: j.type || null,
        workModeHint: remote ? "remote" : null,
        postedAt: j.updated ? new Date(j.updated) : null,
        postedVia: j.source || "Jooble",
        applyLinks: j.link ? [{ site: j.source || "Jooble", url: j.link }] : [],
      }));
      const more = jobs.length > 0 && page * JOOBLE_PAGE_SIZE < data.totalCount;
      return { jobs, nextPage: more ? String(page + 1) : undefined, requestsUsed: 1 };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// SerpApi Google Jobs (backup 2 and quality source): full descriptions, "via" and every apply link, including
// company career sites that publish JobPosting data. The free plan is 250 searches a month; the remaining count
// is read from SerpApi's account endpoint, which doesn't use a search.

type SerpApiJobsResponse = {
  error?: string;
  jobs_results?: {
    job_id: string;
    title: string;
    company_name: string;
    location: string;
    via?: string;
    description?: string;
    detected_extensions?: { posted_at?: string; schedule_type?: string; salary?: string; work_from_home?: boolean };
    /** Free-text chips; sometimes the only place the posting age appears ("3 days ago"). */
    extensions?: string[];
    apply_options?: { title: string; link: string }[];
    share_link?: string;
  }[];
  serpapi_pagination?: { next_page_token?: string };
};

/** "3 days ago", "an hour ago", "30+ days ago" → a date. */
export function relativeDate(text: string | undefined, now: Date): Date | null {
  if (!text) return null;
  const m = text.match(/(\d+|an?)\+?\s*(minute|hour|day|week|month)s?\s+ago/i);
  if (!m) return null;
  const n = /^an?$/i.test(m[1]) ? 1 : Number(m[1]);
  const unitMs = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000 }[
    m[2].toLowerCase() as "minute"
  ];
  return new Date(now.getTime() - n * unitMs);
}

export function serpapiProvider(
  env: Env,
  fetchImpl: Fetch = fetch,
  now: () => Date = () => new Date(),
): JobSearchProvider {
  const key = env.SERPAPI_API_KEY;
  return {
    name: "serpapi",
    label: "SerpApi Google Jobs",
    configured: Boolean(key),
    // Free plan: 250 searches a month and 50 an hour.
    limits: { minute: 5, month: num(env.SERPAPI_MONTHLY_QUOTA, 225) },
    async search(params) {
      const remote = isRemote(params.location);
      const query = new URLSearchParams({
        engine: "google_jobs",
        q: remote ? `${params.query} remote` : `${params.query} ${params.location}`,
        gl: params.country,
        hl: "en",
        api_key: key ?? "",
      });
      if (params.page) query.set("next_page_token", params.page);
      const data = await fetchJson<SerpApiJobsResponse>("serpapi", `https://serpapi.com/search.json?${query}`, {
        fetch: fetchImpl,
      });
      // SerpApi answers 200 with an error for "no results"; anything else is a real failure.
      if (data.error && !/hasn't returned any results/i.test(data.error))
        throw new ProviderHttpError("serpapi", 502, data.error, null);
      const jobs: NormalizedJob[] = (data.jobs_results ?? []).map((j) => {
        const links: ApplyLink[] = (j.apply_options ?? []).map((o) => ({ site: o.title, url: o.link }));
        return {
          provider: "serpapi",
          externalId: j.job_id,
          title: j.title,
          company: j.company_name ?? "",
          location: j.location ?? "",
          description: j.description ?? "",
          descriptionTruncated: false,
          salaryText: j.detected_extensions?.salary ?? null,
          salaryMin: null,
          salaryMax: null,
          salaryEstimated: false,
          employmentType: j.detected_extensions?.schedule_type ?? null,
          workModeHint: j.detected_extensions?.work_from_home || remote ? "remote" : null,
          postedAt: relativeDate(
            j.detected_extensions?.posted_at ?? j.extensions?.find((e) => /\bago\b/i.test(e)),
            now(),
          ),
          postedVia: j.via?.replace(/^via\s+/i, "") ?? null,
          applyLinks: links.length ? links : j.share_link ? [{ site: "Google Jobs", url: j.share_link }] : [],
        };
      });
      let reportedRemaining: number | null = null;
      try {
        const account = await fetchJson<{ total_searches_left?: number }>(
          "serpapi",
          `https://serpapi.com/account.json?api_key=${encodeURIComponent(key ?? "")}`,
          { fetch: fetchImpl },
        );
        reportedRemaining = account.total_searches_left ?? null;
      } catch {
        // The count is a bonus; local counting still protects the quota.
      }
      return {
        jobs,
        nextPage: data.serpapi_pagination?.next_page_token,
        requestsUsed: 1,
        reportedRemaining,
      };
    },
    async check() {
      const account = await fetchJson<{ plan_name?: string; total_searches_left?: number }>(
        "serpapi",
        `https://serpapi.com/account.json?api_key=${encodeURIComponent(key ?? "")}`,
        { fetch: fetchImpl },
      );
      return `Connected (${account.plan_name ?? "plan"}): ${account.total_searches_left ?? "?"} searches left this month.`;
    },
  };
}
