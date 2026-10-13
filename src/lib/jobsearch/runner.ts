// Job-search chain (SPEC §7.2–7.3, §10.4): each query goes to the first available provider (Adzuna → Jooble →
// SerpApi). SerpApi also answers a few top-priority queries every run while its quota allows, because it brings
// postings from LinkedIn, Naukri and company career sites that the others miss.
import { AppError } from "@/lib/errors";
import { AllProvidersUnavailableError, checkAvailability, runWithFailover } from "@/lib/providers/chain";
import type { ProviderStateStore } from "@/lib/providers/types";
import { classifyServiceError } from "./http";
import { adzunaProvider, joobleProvider, serpapiProvider } from "./providers";
import { mockProvider } from "./mock";
import type { JobSearchParams, JobSearchProvider, JobSearchResult } from "./types";

type Env = Record<string, string | undefined>;

const FACTORIES: Record<string, (env: Env) => JobSearchProvider> = {
  adzuna: (env) => adzunaProvider(env),
  jooble: (env) => joobleProvider(env),
  serpapi: (env) => serpapiProvider(env),
  mock: () => mockProvider(),
};

export const KNOWN_JOB_SEARCH_PROVIDERS = Object.keys(FACTORIES);

/** Providers named in JOB_SEARCH_PROVIDERS, in order (default: the mock). */
export function buildJobSearchProviders(env: Env = process.env): JobSearchProvider[] {
  const names = (env.JOB_SEARCH_PROVIDERS || "mock")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name, index, all) => name && FACTORIES[name] && all.indexOf(name) === index);
  return names.map((name) => FACTORIES[name](env));
}

export type JobSearchRunnerDeps = {
  getProviders: () => Promise<{ providers: JobSearchProvider[]; disabled: ReadonlySet<string> }>;
  store: ProviderStateStore;
  now?: () => Date;
};

export type ChainSearchResult = JobSearchResult & { provider: string; fallbackFrom: string | null };

export function createJobSearchRunner(deps: JobSearchRunnerDeps) {
  const now = deps.now ?? (() => new Date());

  /** One query through the chain. Throws AppError SEARCH_* when no provider can answer. */
  async function search(params: JobSearchParams): Promise<ChainSearchResult> {
    const { providers, disabled } = await deps.getProviders();
    try {
      const run = await runWithFailover({
        service: "job_search",
        providers,
        disabled,
        store: deps.store,
        now,
        classify: classifyServiceError,
        call: (provider) => provider.search(params),
        remainingOf: (result) => result.reportedRemaining,
      });
      return { ...run.result, provider: run.provider.name, fallbackFrom: run.fallbackFrom };
    } catch (error) {
      if (!(error instanceof AllProvidersUnavailableError)) throw error;
      throw new AppError(error.noneConfigured ? "SEARCH_NOT_CONFIGURED" : "SEARCH_QUOTA_EXCEEDED", {
        cause: error,
        details: { nextAvailableAt: error.nextAvailableAt?.toISOString() },
      });
    }
  }

  /**
   * A priority query for SerpApi alone, used for the top queries of each run. Returns null (without spending
   * anything) when SerpApi isn't configured, is disabled, or is near its monthly allowance. A failed request
   * throws, so the run can note that a priority query was lost instead of skipping it silently.
   */
  async function searchPriority(params: JobSearchParams): Promise<ChainSearchResult | null> {
    const { providers, disabled } = await deps.getProviders();
    const serpapi = providers.find((p) => p.name === "serpapi");
    if (!serpapi) return null;
    const health = await deps.store.getHealth("job_search", serpapi.name);
    const usage = await deps.store.getUsage("job_search", serpapi.name, now());
    if (!checkAvailability(serpapi, health, usage, now(), { disabled: disabled.has(serpapi.name) }).available)
      return null;
    try {
      const run = await runWithFailover({
        service: "job_search",
        providers: [serpapi],
        disabled,
        store: deps.store,
        now,
        classify: classifyServiceError,
        call: (provider) => provider.search(params),
        remainingOf: (result) => result.reportedRemaining,
      });
      return { ...run.result, provider: run.provider.name, fallbackFrom: null };
    } catch (error) {
      // With one provider, "all unavailable" means SerpApi just failed (timeout, 5xx, 429); say so.
      if (error instanceof AllProvidersUnavailableError) {
        throw new AppError("SEARCH_FAILED", { message: "SerpApi didn't answer.", cause: error });
      }
      throw error;
    }
  }

  /** Settings → Services "Test": one small real query to a single provider. */
  async function testProvider(name: string): Promise<{ ok: boolean; message: string }> {
    const { providers } = await deps.getProviders();
    const provider = providers.find((p) => p.name === name);
    if (!provider) return { ok: false, message: "This provider isn't in JOB_SEARCH_PROVIDERS." };
    if (!provider.configured) return { ok: false, message: "No API key set in .env." };
    try {
      if (provider.check) return { ok: true, message: await provider.check() };
      await deps.store.recordRequest("job_search", provider.name, now());
      const result = await provider.search({ query: "Software Engineer", location: "Bengaluru", country: "in" });
      return { ok: true, message: `Connected: ${result.jobs.length} postings on the first page.` };
    } catch (error) {
      const failure = classifyServiceError(error);
      const messages: Record<string, string> = {
        auth: "The key was rejected. Check it in .env.",
        rate_limited: "Rate limited right now. Try again in a minute.",
        quota_exhausted: "The free allowance is used up until it resets.",
        transient: "The service didn't respond. Try again later.",
      };
      return { ok: false, message: messages[failure.kind] ?? "The test failed." };
    }
  }

  return { search, searchPriority, testProvider };
}

export type JobSearchRunner = ReturnType<typeof createJobSearchRunner>;
