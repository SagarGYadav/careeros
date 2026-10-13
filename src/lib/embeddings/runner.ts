// Embedding chain (SPEC §7.2): local model → Cloudflare (same model). When no provider can answer, embedding is
// deferred: the caller ranks without the semantic part and embeds the job later (SPEC §10.5).
import { classifyServiceError } from "@/lib/jobsearch/http";
import { AllProvidersUnavailableError, runWithFailover } from "@/lib/providers/chain";
import type { ProviderStateStore } from "@/lib/providers/types";
import type { EmbeddingProvider } from "./providers";

export type EmbeddingRunnerDeps = {
  getProviders: () => Promise<{ providers: EmbeddingProvider[]; disabled: ReadonlySet<string> }>;
  store: ProviderStateStore;
  now?: () => Date;
};

export type EmbedResult = { vectors: number[][]; model: string; providers: string[] };

export function createEmbeddingRunner(deps: EmbeddingRunnerDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * Embeds texts in batches. Every batch may come from a different provider, but only providers running the same
   * model as the first in the chain are used, so all vectors stay comparable. Returns null when deferred.
   */
  async function embed(texts: string[]): Promise<EmbedResult | null> {
    const { providers: all, disabled } = await deps.getProviders();
    if (!all.length) return null;
    const model = all[0].model;
    const providers = all.filter((p) => p.model === model);
    const vectors: number[][] = [];
    const used = new Set<string>();
    const batchSize = Math.min(...providers.map((p) => p.batchSize));
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize);
      try {
        const run = await runWithFailover({
          service: "embeddings",
          providers,
          disabled,
          store: deps.store,
          now,
          classify: classifyServiceError,
          call: (provider) => provider.embed(batch),
        });
        vectors.push(...run.result);
        used.add(run.provider.name);
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) return null;
        throw error;
      }
    }
    return { vectors, model, providers: [...used] };
  }

  return { embed };
}

export type EmbeddingRunner = ReturnType<typeof createEmbeddingRunner>;
