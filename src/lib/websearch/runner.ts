// Web-search chain runner (SPEC §7.2–7.3): each query goes to the first available provider (Tavily → Exa →
// Firecrawl) with quotas, cooldowns and failover. When none can answer, discovery pauses; known career sites are
// still re-checked through their keyless ATS APIs.
import { AppError } from "@/lib/errors";
import { classifyServiceError } from "@/lib/jobsearch/http";
import { AllProvidersUnavailableError, runWithFailover } from "@/lib/providers/chain";
import type { ProviderStateStore } from "@/lib/providers/types";
import {
  exaProvider,
  firecrawlProvider,
  mockWebSearchProvider,
  tavilyProvider,
  type WebSearchProvider,
  type WebSearchQuery,
  type WebSearchResult,
} from "./providers";

type Env = Record<string, string | undefined>;

const FACTORIES: Record<string, (env: Env) => WebSearchProvider> = {
  tavily: (env) => tavilyProvider(env),
  exa: (env) => exaProvider(env),
  firecrawl: (env) => firecrawlProvider(env),
  mock: () => mockWebSearchProvider(),
};

/** Providers named in WEB_SEARCH_PROVIDERS, in order (default: the mock). */
export function buildWebSearchProviders(env: Env = process.env): WebSearchProvider[] {
  const names = (env.WEB_SEARCH_PROVIDERS || "mock")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name, index, all) => name && FACTORIES[name] && all.indexOf(name) === index);
  return names.map((name) => FACTORIES[name](env));
}

export type WebSearchRunnerDeps = {
  getProviders: () => Promise<{ providers: WebSearchProvider[]; disabled: ReadonlySet<string> }>;
  store: ProviderStateStore;
  now?: () => Date;
};

export type ChainWebSearchResult = WebSearchResult & { provider: string; fallbackFrom: string | null };

export function createWebSearchRunner(deps: WebSearchRunnerDeps) {
  const now = deps.now ?? (() => new Date());

  /** One query through the chain. Throws AppError SEARCH_* when no provider can answer. */
  async function search(query: WebSearchQuery): Promise<ChainWebSearchResult> {
    const { providers, disabled } = await deps.getProviders();
    try {
      const run = await runWithFailover({
        service: "web_search",
        providers,
        disabled,
        store: deps.store,
        now,
        classify: classifyServiceError,
        call: (provider) => provider.search(query),
      });
      return { ...run.result, provider: run.provider.name, fallbackFrom: run.fallbackFrom };
    } catch (error) {
      if (!(error instanceof AllProvidersUnavailableError)) throw error;
      throw new AppError(error.noneConfigured ? "SEARCH_NOT_CONFIGURED" : "SEARCH_QUOTA_EXCEEDED", {
        cause: error,
        message: error.noneConfigured
          ? "No web search provider is set up, so new company sites can't be discovered."
          : "The free web searches are used up for now; known company sites are still checked.",
      });
    }
  }

  /** Settings → Services "Test": one small search through a single provider. */
  async function testProvider(name: string): Promise<{ ok: boolean; message: string }> {
    const { providers } = await deps.getProviders();
    const provider = providers.find((p) => p.name === name);
    if (!provider) return { ok: false, message: "This provider isn't in WEB_SEARCH_PROVIDERS." };
    if (!provider.configured) return { ok: false, message: "No API key set in .env." };
    try {
      await deps.store.recordRequest("web_search", provider.name, now());
      const result = await provider.search({ query: "careers frontend developer", maxResults: 1 });
      return { ok: true, message: `Connected (${result.hits.length} result).` };
    } catch (error) {
      const failure = classifyServiceError(error);
      return { ok: false, message: failure.kind === "auth" ? "The API key was rejected." : failure.message };
    }
  }

  return { search, testProvider };
}

export type WebSearchRunner = ReturnType<typeof createWebSearchRunner>;
