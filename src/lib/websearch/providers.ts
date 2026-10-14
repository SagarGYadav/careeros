// Web search chain (SPEC §7.2, §11.2): Tavily → Exa → Firecrawl, used to discover company career sites. Each
// provider maps its own API to plain hits (url, title, snippet). Endpoints checked against the official docs on
// 2026-10-14: Tavily POST /search (1 credit per basic search, 1,000 free a month), Exa POST /search (free credits,
// ~$7 per 1,000 searches), Firecrawl POST /v2/search (2 credits per 10 results, ~1,000 free credits).
import { fetchJson } from "@/lib/jobsearch/http";
import type { ProviderInfo } from "@/lib/providers/types";

export type WebSearchQuery = {
  /** Built from role titles and locations; never contains personal details. */
  query: string;
  /** Only results from these hosts (ATS boards), when given. */
  includeDomains?: string[];
  maxResults: number;
};

export type WebSearchHit = { url: string; title: string; snippet: string };
export type WebSearchResult = { hits: WebSearchHit[]; requestsUsed: number };

export type WebSearchProvider = ProviderInfo & {
  search: (query: WebSearchQuery) => Promise<WebSearchResult>;
};

type Env = Record<string, string | undefined>;
type Fetch = typeof fetch;

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const json = (body: unknown, headers: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export function tavilyProvider(env: Env, fetchImpl: Fetch = fetch): WebSearchProvider {
  const key = env.TAVILY_API_KEY;
  return {
    name: "tavily",
    label: "Tavily",
    configured: Boolean(key),
    // Free: 1,000 credits a month; a basic search is 1 credit.
    limits: { minute: 20, month: num(env.TAVILY_MONTHLY_QUOTA, 900) },
    async search(q) {
      const data = await fetchJson<{ results?: { url: string; title?: string; content?: string }[] }>(
        "tavily",
        "https://api.tavily.com/search",
        {
          ...json(
            {
              query: q.query,
              max_results: Math.min(q.maxResults, 20),
              search_depth: "basic",
              ...(q.includeDomains?.length && { include_domains: q.includeDomains }),
            },
            { authorization: `Bearer ${key ?? ""}` },
          ),
          fetch: fetchImpl,
        },
      );
      return {
        hits: (data.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: r.content ?? "" })),
        requestsUsed: 1,
      };
    },
  };
}

export function exaProvider(env: Env, fetchImpl: Fetch = fetch): WebSearchProvider {
  const key = env.EXA_API_KEY;
  return {
    name: "exa",
    label: "Exa",
    configured: Boolean(key),
    // Free credits are in dollars (~$7 per 1,000 searches); 600 a month stays inside them.
    limits: { minute: 20, month: num(env.EXA_MONTHLY_QUOTA, 600) },
    async search(q) {
      const data = await fetchJson<{ results?: { url: string; title?: string | null; text?: string }[] }>(
        "exa",
        "https://api.exa.ai/search",
        {
          ...json(
            {
              query: q.query,
              numResults: Math.min(q.maxResults, 25),
              type: "auto",
              ...(q.includeDomains?.length && { includeDomains: q.includeDomains }),
            },
            { "x-api-key": key ?? "" },
          ),
          fetch: fetchImpl,
        },
      );
      return {
        hits: (data.results ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: r.text ?? "" })),
        requestsUsed: 1,
      };
    },
  };
}

export function firecrawlProvider(env: Env, fetchImpl: Fetch = fetch): WebSearchProvider {
  const key = env.FIRECRAWL_API_KEY;
  return {
    name: "firecrawl",
    label: "Firecrawl",
    configured: Boolean(key),
    // ~1,000 free credits; a search of up to 10 results costs 2.
    limits: { minute: 2, month: num(env.FIRECRAWL_MONTHLY_QUOTA, 400) },
    async search(q) {
      const data = await fetchJson<{ data?: { web?: { url: string; title?: string; description?: string }[] } }>(
        "firecrawl",
        "https://api.firecrawl.dev/v2/search",
        {
          ...json(
            {
              query: q.query,
              limit: Math.min(q.maxResults, 10),
              ...(q.includeDomains?.length && { includeDomains: q.includeDomains }),
            },
            { authorization: `Bearer ${key ?? ""}` },
          ),
          fetch: fetchImpl,
        },
      );
      return {
        hits: (data.data?.web ?? []).map((r) => ({ url: r.url, title: r.title ?? "", snippet: r.description ?? "" })),
        requestsUsed: 1,
      };
    },
  };
}

/** Fictional board URLs on the real ATS hosts, so discovery can be developed and tested without keys. */
const MOCK_BOARDS = [
  "https://boards.greenhouse.io/kestrelpay",
  "https://job-boards.greenhouse.io/lumenledger/jobs/4012345",
  "https://jobs.lever.co/copperleaf",
  "https://jobs.lever.co/copperleaf/7f3e2c1a-0000-4000-8000-000000000001",
  "https://jobs.ashbyhq.com/tamarind-commerce",
  "https://jobs.smartrecruiters.com/MosaicRetailCloud",
  "https://halcyonstreams.recruitee.com/o/backend-engineer-go",
  "https://bluebelltravel.keka.com/careers",
  "https://www.linkedin.com/jobs/view/1234",
];

export function mockWebSearchProvider(): WebSearchProvider {
  return {
    name: "mock",
    label: "Mock web search",
    configured: true,
    isMock: true,
    limits: {},
    async search(q) {
      const hosts = q.includeDomains ?? [];
      const urls = MOCK_BOARDS.filter((url) => !hosts.length || hosts.some((h) => new URL(url).hostname.endsWith(h)));
      return {
        hits: urls
          .slice(0, q.maxResults)
          .map((url) => ({ url, title: `Careers · ${new URL(url).hostname}`, snippet: q.query })),
        requestsUsed: 1,
      };
    },
  };
}
