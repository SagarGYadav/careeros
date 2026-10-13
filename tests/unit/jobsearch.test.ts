// Job-search providers, chain and embeddings, with fake HTTP responses shaped like each API (fictional data).
import { describe, expect, it } from "vitest";
import { cosine, mockEmbedding, buildEmbeddingProviders, type EmbeddingProvider } from "@/lib/embeddings/providers";
import { createEmbeddingRunner } from "@/lib/embeddings/runner";
import { mockPostings, mockProvider } from "@/lib/jobsearch/mock";
import { adzunaProvider, joobleProvider, plainText, relativeDate, serpapiProvider } from "@/lib/jobsearch/providers";
import { buildJobSearchProviders, createJobSearchRunner } from "@/lib/jobsearch/runner";
import { ProviderHttpError, type JobSearchProvider } from "@/lib/jobsearch/types";
import { AppError } from "@/lib/errors";
import { MemoryProviderStore } from "@/lib/providers/memory-store";

const NOW = new Date("2026-10-13T10:00:00Z");
const ENV = {
  ADZUNA_APP_ID: "test-id",
  ADZUNA_APP_KEY: "test-key",
  JOOBLE_API_KEY: "test-jooble",
  SERPAPI_API_KEY: "test-serp",
};

/** A fetch that answers from a list of handlers and records each request. */
function fakeFetch(
  handler: (url: string, init?: RequestInit) => { status?: number; body: unknown; headers?: Record<string, string> },
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const { status = 200, body, headers = {} } = handler(url, init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
  }) as typeof fetch;
  return { fn, calls };
}

describe("job-search providers map each API to common fields", () => {
  it("Adzuna: India search, salary, truncated description, apply link and paging", async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: {
        count: 120,
        results: Array.from({ length: 50 }, (_, i) => ({
          id: `adz-${i}`,
          title: "React Developer",
          description: "Build dashboards in <strong>React</strong> and TypeScript…",
          created: "2026-10-10T05:00:00Z",
          redirect_url: `https://www.adzuna.in/land/ad/${i}`,
          salary_min: 1000000,
          salary_max: 1600000,
          salary_is_predicted: i === 0 ? "1" : "0",
          contract_time: "full_time",
          company: { display_name: "Kestrel Pay Pvt. Ltd." },
          location: { display_name: "Bangalore, Karnataka" },
        })),
      },
    }));
    const result = await adzunaProvider(ENV, fn).search({
      query: "React Developer",
      location: "Bengaluru",
      country: "in",
      datePosted: "week",
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v1/api/jobs/in/search/1");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      what: "React Developer",
      where: "Bengaluru",
      max_days_old: "7",
    });
    expect(result.nextPage).toBe("2");
    expect(result.jobs[0]).toMatchObject({
      provider: "adzuna",
      externalId: "adz-0",
      company: "Kestrel Pay Pvt. Ltd.",
      description: "Build dashboards in React and TypeScript…",
      descriptionTruncated: true,
      salaryMin: 1000000,
      salaryEstimated: true,
      employmentType: "Full-time",
      applyLinks: [{ site: "Adzuna", url: "https://www.adzuna.in/land/ad/0" }],
    });
    const remote = await adzunaProvider(ENV, fn).search({
      query: "React Developer",
      location: "Remote",
      country: "in",
    });
    expect(new URL(calls[1].url).searchParams.get("where")).toBeNull();
    expect(new URL(calls[1].url).searchParams.get("what")).toBe("React Developer remote");
    expect(remote.jobs[0].workModeHint).toBe("remote");
  });

  it("Jooble: filters India by country and puts the city in the keywords; strips HTML", async () => {
    const { fn, calls } = fakeFetch(() => ({
      body: {
        totalCount: 3,
        jobs: [
          {
            id: 12345,
            title: "<b>React</b> Developer",
            location: "India",
            snippet: "&nbsp;Work on <b>React</b> apps&nbsp;",
            salary: "8-12 LPA",
            source: "careers.example.com",
            type: "Full-time",
            link: "https://jooble.org/desc/12345",
            company: "Quill Commerce",
            updated: "2026-10-01T00:00:00.0000000",
          },
        ],
      },
    }));
    const result = await joobleProvider(ENV, fn).search({ query: "React Developer", location: "Pune", country: "in" });
    expect(calls[0].url).toBe("https://jooble.org/api/test-jooble");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      keywords: "React Developer Pune",
      location: "India",
      page: "1",
    });
    expect(result.jobs[0]).toMatchObject({
      title: "React Developer",
      description: "Work on React apps",
      salaryText: "8-12 LPA",
      postedVia: "careers.example.com",
    });
    expect(result.nextPage).toBeUndefined();
  });

  it("SerpApi: full description, every apply link, 'via', relative dates and the reported allowance", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.includes("account.json")
        ? { body: { plan_name: "Free Plan", total_searches_left: 241 } }
        : {
            body: {
              jobs_results: [
                {
                  job_id: "eyJqb2IiOiAiMSJ9",
                  title: "Frontend Engineer",
                  company_name: "Monsoon Labs",
                  location: "Bengaluru, Karnataka, India",
                  via: "via Monsoon Labs Careers",
                  description: "Full description of the role.",
                  detected_extensions: {
                    posted_at: "3 days ago",
                    schedule_type: "Full-time",
                    salary: "₹18L–₹24L a year",
                  },
                  apply_options: [
                    { title: "Monsoon Labs Careers", link: "https://careers.monsoon.example/jobs/1" },
                    { title: "LinkedIn", link: "https://www.linkedin.com/jobs/view/1" },
                  ],
                },
              ],
              serpapi_pagination: { next_page_token: "token-2" },
            },
          },
    );
    const result = await serpapiProvider(ENV, fn, () => NOW).search({
      query: "Frontend Engineer",
      location: "Bengaluru",
      country: "in",
    });
    expect(new URL(calls[0].url).searchParams.get("q")).toBe("Frontend Engineer Bengaluru");
    expect(result).toMatchObject({ nextPage: "token-2", reportedRemaining: 241 });
    expect(result.jobs[0]).toMatchObject({
      descriptionTruncated: false,
      postedVia: "Monsoon Labs Careers",
      salaryText: "₹18L–₹24L a year",
      postedAt: new Date("2026-10-10T10:00:00Z"),
    });
    expect(result.jobs[0].applyLinks).toHaveLength(2);
  });

  it("SerpApi: 'no results' is an empty page, other errors are provider failures", async () => {
    const noResults = fakeFetch((url) =>
      url.includes("account")
        ? { body: {} }
        : { body: { error: "Google hasn't returned any results for this query." } },
    );
    expect(
      (await serpapiProvider(ENV, noResults.fn).search({ query: "x", location: "Pune", country: "in" })).jobs,
    ).toEqual([]);
    const failing = fakeFetch(() => ({ body: { error: "Something unexpected" } }));
    await expect(
      serpapiProvider(ENV, failing.fn).search({ query: "x", location: "Pune", country: "in" }),
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("reads relative dates and cleans HTML snippets", () => {
    expect(relativeDate("an hour ago", NOW)).toEqual(new Date("2026-10-13T09:00:00Z"));
    expect(relativeDate("30+ days ago", NOW)).toEqual(new Date("2026-09-13T10:00:00Z"));
    expect(relativeDate("Just posted", NOW)).toBeNull();
    expect(plainText("A&amp;B <br/>next&nbsp;line")).toBe("A&B \nnext line");
  });
});

describe("mock job search", () => {
  it("has about 60 fictional postings with near-duplicates and agency reposts", () => {
    const all = mockPostings(NOW);
    expect(all).toHaveLength(60);
    expect(new Set(all.map((j) => j.externalId)).size).toBe(60);
    expect(all.filter((j) => j.externalId.includes("dup"))).toHaveLength(5);
    expect(all.some((j) => j.company.includes("Staffing"))).toBe(true);
  });

  it("matches title words and the city (Bangalore = Bengaluru), and pages results", async () => {
    const provider = mockProvider(() => NOW);
    const result = await provider.search({ query: "React Developer", location: "Bengaluru", country: "in" });
    // The original, its "React JS Developer" repost spelled Bangalore, and an agency's contract-to-hire posting.
    expect(result.jobs.map((j) => j.externalId).sort()).toEqual(["mock-1", "mock-1-dup1", "mock-16"]);
    expect(result.jobs.every((j) => /react/i.test(j.title) && /^(bengaluru|bangalore)/i.test(j.location))).toBe(true);
    const remote = await provider.search({ query: "Frontend", location: "Remote", country: "in" });
    expect(remote.jobs.every((j) => j.location.startsWith("Remote"))).toBe(true);
  });
});

describe("job-search chain", () => {
  const fake = (
    name: JobSearchProvider["name"],
    behaviour: () => Promise<unknown>,
    extra: Partial<JobSearchProvider> = {},
  ): JobSearchProvider => ({
    name,
    label: name,
    configured: true,
    limits: { day: 10 },
    search: async () => (await behaviour()) as never,
    ...extra,
  });
  const page = (n: number, extra = {}) => ({
    jobs: Array.from({ length: n }, () => ({}) as never),
    requestsUsed: 1,
    ...extra,
  });

  it("fails over from a rate-limited Adzuna to Jooble and says so", async () => {
    const providers = [
      fake("adzuna", async () => {
        throw new ProviderHttpError("adzuna", 429, "Too many requests", "60");
      }),
      fake("jooble", async () => page(3)),
    ];
    const store = new MemoryProviderStore();
    const runner = createJobSearchRunner({
      getProviders: async () => ({ providers, disabled: new Set() }),
      store,
      now: () => NOW,
    });
    const result = await runner.search({ query: "React Developer", location: "Pune", country: "in" });
    expect(result).toMatchObject({ provider: "jooble", fallbackFrom: "adzuna" });
    expect((await store.getHealth("job_search", "adzuna")).cooldownUntil).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it("stores SerpApi's reported allowance and stops priority queries when it runs out", async () => {
    const store = new MemoryProviderStore();
    let remaining = 1;
    const serpapi = fake("serpapi", async () => page(2, { reportedRemaining: --remaining }), {
      limits: { month: 225 },
    });
    const runner = createJobSearchRunner({
      getProviders: async () => ({ providers: [serpapi], disabled: new Set() }),
      store,
      now: () => NOW,
    });
    expect(await runner.searchPriority({ query: "q", location: "Pune", country: "in" })).toMatchObject({
      provider: "serpapi",
    });
    expect((await store.getHealth("job_search", "serpapi")).reportedRemaining).toBe(0);
    expect(await runner.searchPriority({ query: "q", location: "Pune", country: "in" })).toBeNull();
  });

  it("reports a failed priority query instead of skipping it silently", async () => {
    const store = new MemoryProviderStore();
    const serpapi = fake(
      "serpapi",
      async () => {
        throw new ProviderHttpError("serpapi", 503, "busy", null);
      },
      { limits: { month: 225 } },
    );
    const runner = createJobSearchRunner({
      getProviders: async () => ({ providers: [serpapi], disabled: new Set() }),
      store,
      now: () => NOW,
    });
    await expect(runner.searchPriority({ query: "q", location: "Pune", country: "in" })).rejects.toBeInstanceOf(
      AppError,
    );
    // Resting after the failure, it is skipped (null) without another request.
    expect(await runner.searchPriority({ query: "q", location: "Pune", country: "in" })).toBeNull();
  });

  it("explains when nothing is configured", async () => {
    const unconfigured = fake("adzuna", async () => page(1), { configured: false });
    const runner = createJobSearchRunner({
      getProviders: async () => ({ providers: [unconfigured], disabled: new Set() }),
      store: new MemoryProviderStore(),
      now: () => NOW,
    });
    await expect(runner.search({ query: "q", location: "Pune", country: "in" })).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
    });
    await expect(runner.search({ query: "q", location: "Pune", country: "in" })).rejects.toBeInstanceOf(AppError);
  });

  it("builds the chain from JOB_SEARCH_PROVIDERS", () => {
    expect(buildJobSearchProviders({ JOB_SEARCH_PROVIDERS: "adzuna, jooble,serpapi,nope" }).map((p) => p.name)).toEqual(
      ["adzuna", "jooble", "serpapi"],
    );
    expect(buildJobSearchProviders({}).map((p) => p.name)).toEqual(["mock"]);
  });
});

describe("embeddings", () => {
  it("mock vectors are unit length and closer for related texts", () => {
    const react = mockEmbedding("Senior React developer building Next.js dashboards in TypeScript");
    const close = mockEmbedding("React and TypeScript developer for Next.js dashboards");
    const far = mockEmbedding("Accountant handling GST filings and payroll");
    expect(cosine(react, react)).toBeCloseTo(1, 6);
    expect(cosine(react, close)).toBeGreaterThan(cosine(react, far) + 0.3);
  });

  it("batches, falls back to the backup and defers when no provider can answer", async () => {
    const calls: string[] = [];
    const provider = (name: string, fail: boolean): EmbeddingProvider => ({
      name,
      label: name,
      configured: true,
      limits: {},
      model: "bge-small-en-v1.5",
      batchSize: 2,
      embed: async (texts) => {
        calls.push(`${name}:${texts.length}`);
        if (fail) throw new ProviderHttpError(name, 503, "busy", null);
        return texts.map(() => [1, 0]);
      },
    });
    const runner = createEmbeddingRunner({
      getProviders: async () => ({
        providers: [provider("local", true), provider("cloudflare", false)],
        disabled: new Set(),
      }),
      store: new MemoryProviderStore(),
      now: () => NOW,
    });
    const result = await runner.embed(["a", "b", "c"]);
    expect(result).toMatchObject({ model: "bge-small-en-v1.5", providers: ["cloudflare"] });
    expect(result!.vectors).toHaveLength(3);
    // The busy local model rests for a minute after its first 503, so the second batch goes straight to Cloudflare.
    expect(calls).toEqual(["local:2", "cloudflare:2", "cloudflare:1"]);

    const none = createEmbeddingRunner({
      getProviders: async () => ({ providers: [provider("local", true)], disabled: new Set() }),
      store: new MemoryProviderStore(),
      now: () => NOW,
    });
    expect(await none.embed(["a"])).toBeNull();
  });

  it("builds the chain from EMBEDDING_PROVIDERS", () => {
    expect(buildEmbeddingProviders({ EMBEDDING_PROVIDERS: "local,cloudflare" }).map((p) => [p.name, p.model])).toEqual([
      ["local", "bge-small-en-v1.5"],
      ["cloudflare", "bge-small-en-v1.5"],
    ]);
  });
});
