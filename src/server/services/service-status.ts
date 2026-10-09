import "server-only";
import { connection } from "next/server";
import { providerStatus } from "@/lib/providers/chain";
import { summariseService, type ServiceSummary } from "@/lib/providers/summary";
import { loadAiProviders } from "@/server/ai/runner";
import { prismaProviderStore } from "@/server/repositories/provider-state";

/** Live status of the AI chain for Settings → Services, the header badge and the backup banner. */
export async function getAiServiceSummary(): Promise<ServiceSummary> {
  // Provider state depends on the current time, so it must be computed per request, never prerendered.
  await connection();
  const now = new Date();
  const { providers, disabled } = await loadAiProviders();
  const statuses = await Promise.all(
    providers.map(async (provider) => {
      const [health, usage] = await Promise.all([
        prismaProviderStore.getHealth("ai", provider.name),
        prismaProviderStore.getUsage("ai", provider.name, now),
      ]);
      return providerStatus(provider, health, usage, now, !disabled.has(provider.name));
    }),
  );
  return summariseService("ai", "AI", statuses);
}
