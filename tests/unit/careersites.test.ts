import { describe, expect, it } from "vitest";
import { detectSite, nameFromTitle, nameFromToken } from "@/lib/careersites/ats";
import { buildDiscoveryQueries } from "@/lib/careersites/discovery";
import { ProviderHttpError } from "@/lib/jobsearch/types";
import { MemoryProviderStore } from "@/lib/providers/memory-store";
import { exaProvider, firecrawlProvider, tavilyProvider, type WebSearchProvider } from "@/lib/websearch/providers";
import { createWebSearchRunner } from "@/lib/websearch/runner";

describe("ATS host detection", () => {
  it.each([
    ["https://boards.greenhouse.io/kestrelpay", "greenhouse:kestrelpay", "https://boards.greenhouse.io/kestrelpay"],
    [
      "https://job-boards.greenhouse.io/KestrelPay/jobs/4012345",
      "greenhouse:kestrelpay",
      "https://boards.greenhouse.io/kestrelpay",
    ],
    [
      "https://boards.greenhouse.io/embed/job_board?for=lumenledger",
      "greenhouse:lumenledger",
      "https://boards.greenhouse.io/lumenledger",
    ],
    [
      "https://boards-api.greenhouse.io/v1/boards/lumenledger/jobs",
      "greenhouse:lumenledger",
      "https://boards.greenhouse.io/lumenledger",
    ],
    ["https://jobs.lever.co/copperleaf/7f3e2c1a", "lever:copperleaf", "https://jobs.lever.co/copperleaf"],
    ["https://jobs.eu.lever.co/copperleaf", "lever:copperleaf", "https://jobs.lever.co/copperleaf"],
    [
      "https://jobs.ashbyhq.com/tamarind-commerce/abc",
      "ashby:tamarind-commerce",
      "https://jobs.ashbyhq.com/tamarind-commerce",
    ],
    [
      "https://jobs.smartrecruiters.com/MosaicRetailCloud/744000",
      "smartrecruiters:mosaicretailcloud",
      "https://jobs.smartrecruiters.com/MosaicRetailCloud",
    ],
    [
      "https://halcyonstreams.recruitee.com/o/backend-engineer-go",
      "recruitee:halcyonstreams",
      "https://halcyonstreams.recruitee.com",
    ],
    [
      "https://bluebelltravel.keka.com/careers",
      "html:bluebelltravel.keka.com/careers",
      "https://bluebelltravel.keka.com/careers",
    ],
    [
      "https://www.northwind.example/en/careers/openings?team=web",
      "html:www.northwind.example/en/careers",
      "https://www.northwind.example/en/careers",
    ],
    ["https://careers.northwind.example/", "html:careers.northwind.example", "https://careers.northwind.example"],
  ])("%s → %s", (url, key, board) => {
    expect(detectSite(url)).toMatchObject({ key, url: board });
  });

  it("ignores pages that aren't boards or careers pages, and never takes LinkedIn or Naukri", () => {
    for (const url of [
      "https://news.example.com/2026/10/hiring-trends",
      "https://www.linkedin.com/jobs/view/1234",
      "https://www.naukri.com/job-listings-frontend",
      "https://boards.greenhouse.io/",
      "https://jobs.lever.co/embed",
      "http://localhost/careers",
    ]) {
      expect(detectSite(url), url).toBeNull();
    }
  });

  it("reads a company name from a token or a page title", () => {
    expect(nameFromToken("tamarind-commerce")).toBe("Tamarind Commerce");
    expect(nameFromToken("MosaicRetailCloud")).toBe("Mosaic Retail Cloud");
    expect(nameFromTitle("Jobs at Kestrel Pay")).toBe("Kestrel Pay");
    expect(nameFromTitle("Copperleaf - Careers")).toBe("Copperleaf");
    expect(nameFromTitle("Senior Engineer, Platform")).toBeNull();
  });
});

describe("discovery queries", () => {
  it("puts watchlist names first, then one search per ATS host, then open and company searches, within the cap", () => {
    const queries = buildDiscoveryQueries({
      titles: ["Frontend Developer", "React Developer"],
      locations: ["Bengaluru", "Remote"],
      watchlistNames: ["Kestrel Pay"],
      seenCompanies: ["Lumen Ledger"],
      max: 20,
    });
    expect(queries).toHaveLength(20);
    expect(queries[0]).toMatchObject({ query: "Kestrel Pay careers jobs", purpose: "watchlist" });
    expect(queries.slice(1, 8).map((q) => q.includeDomains?.[0])).toEqual([
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "jobs.lever.co",
      "jobs.ashbyhq.com",
      "jobs.smartrecruiters.com",
      "recruitee.com",
      "keka.com",
    ]);
    expect(queries[1].query).toBe("Frontend Developer Bengaluru");
    expect(queries[8].query).toContain('"Frontend Developer" careers Bengaluru -linkedin -naukri');
    expect(queries[9].query).toContain("remote India");
    expect(queries[10]).toMatchObject({ query: "Lumen Ledger careers", purpose: "company" });
    expect(queries.every((q) => !/@|\+91/.test(q.query))).toBe(true);
    expect(
      buildDiscoveryQueries({ titles: ["X"], locations: [], watchlistNames: [], seenCompanies: [], max: 3 })[0].query,
    ).toBe("X India");
  });
});

/** Captures each request and answers with a fixed JSON body. */
function capture(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("web search providers", () => {
  const query = { query: "Frontend Developer Bengaluru", includeDomains: ["jobs.lever.co"], maxResults: 10 };

  it("Tavily: POST /search with a Bearer key and include_domains", async () => {
    const { calls, fetchImpl } = capture({
      results: [{ url: "https://jobs.lever.co/copperleaf", title: "Copperleaf", content: "…" }],
    });
    const result = await tavilyProvider({ TAVILY_API_KEY: "tvly-test" }, fetchImpl).search(query);
    expect(result.hits).toEqual([{ url: "https://jobs.lever.co/copperleaf", title: "Copperleaf", snippet: "…" }]);
    expect(calls[0].url).toBe("https://api.tavily.com/search");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tvly-test");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      query: query.query,
      max_results: 10,
      include_domains: ["jobs.lever.co"],
    });
  });

  it("Exa: POST /search with x-api-key and includeDomains", async () => {
    const { calls, fetchImpl } = capture({ results: [{ url: "https://jobs.lever.co/copperleaf", title: null }] });
    const result = await exaProvider({ EXA_API_KEY: "exa-test" }, fetchImpl).search(query);
    expect(result.hits[0]).toEqual({ url: "https://jobs.lever.co/copperleaf", title: "", snippet: "" });
    expect(calls[0].url).toBe("https://api.exa.ai/search");
    expect((calls[0].init.headers as Record<string, string>)["x-api-key"]).toBe("exa-test");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ numResults: 10, includeDomains: ["jobs.lever.co"] });
  });

  it("Firecrawl: POST /v2/search and reads data.web", async () => {
    const { calls, fetchImpl } = capture({
      success: true,
      data: { web: [{ url: "https://jobs.lever.co/copperleaf", title: "C", description: "d" }] },
    });
    const result = await firecrawlProvider({ FIRECRAWL_API_KEY: "fc-test" }, fetchImpl).search(query);
    expect(result.hits).toEqual([{ url: "https://jobs.lever.co/copperleaf", title: "C", snippet: "d" }]);
    expect(calls[0].url).toBe("https://api.firecrawl.dev/v2/search");
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ limit: 10, includeDomains: ["jobs.lever.co"] });
  });

  it("fails over from a rate-limited Tavily to Exa", async () => {
    const fake = (name: string, search: WebSearchProvider["search"]): WebSearchProvider => ({
      name,
      label: name,
      configured: true,
      limits: { month: 100 },
      search,
    });
    const runner = createWebSearchRunner({
      getProviders: async () => ({
        providers: [
          fake("tavily", async () => {
            throw new ProviderHttpError("tavily", 429, "slow down", "60");
          }),
          fake("exa", async () => ({
            hits: [{ url: "https://jobs.lever.co/x", title: "", snippet: "" }],
            requestsUsed: 1,
          })),
        ],
        disabled: new Set(),
      }),
      store: new MemoryProviderStore(),
    });
    expect(await runner.search(query)).toMatchObject({ provider: "exa", fallbackFrom: "tavily" });
  });
});
