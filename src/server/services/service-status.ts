import "server-only";
import { connection } from "next/server";
import { providerStatus } from "@/lib/providers/chain";
import { summariseService, type ServiceSummary } from "@/lib/providers/summary";
import type { ProviderInfo, ServiceName } from "@/lib/providers/types";
import { loadAiProviders } from "@/server/ai/runner";
import { loadEmbeddingProviders } from "@/server/embeddings/runner";
import { loadJobSearchProviders } from "@/server/jobsearch/runner";
import { loadWebSearchProviders } from "@/server/websearch/runner";
import { prismaProviderStore } from "@/server/repositories/provider-state";

/** The services Settings → Services shows, with how each loads its chain. */
export const SERVICES = {
  ai: { label: "AI", load: loadAiProviders },
  job_search: { label: "Job search", load: loadJobSearchProviders },
  embeddings: { label: "Embeddings", load: loadEmbeddingProviders },
  web_search: { label: "Web search", load: loadWebSearchProviders },
} as const satisfies Partial<
  Record<ServiceName, { label: string; load: () => Promise<{ providers: ProviderInfo[]; disabled: Set<string> }> }>
>;

export type BuiltService = keyof typeof SERVICES;

/** Live status of one chain for Settings → Services, the header badge and the backup banner. */
export async function getServiceSummary(service: BuiltService): Promise<ServiceSummary> {
  // Provider state depends on the current time, so it must be computed per request, never prerendered.
  await connection();
  const now = new Date();
  const { providers, disabled } = await SERVICES[service].load();
  const statuses = await Promise.all(
    providers.map(async (provider: ProviderInfo) => {
      const [health, usage] = await Promise.all([
        prismaProviderStore.getHealth(service, provider.name),
        prismaProviderStore.getUsage(service, provider.name, now),
      ]);
      return providerStatus(provider, health, usage, now, !disabled.has(provider.name));
    }),
  );
  return summariseService(service, SERVICES[service].label, statuses);
}

export const getAiServiceSummary = () => getServiceSummary("ai");
