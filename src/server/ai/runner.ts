import "server-only";
import { buildAiProviders } from "@/lib/ai/providers";
import { createAiRunner } from "@/lib/ai/runner";
import { orderProviders } from "@/lib/providers/chain";
import { aiResultCache, logAiRequest } from "@/server/repositories/ai-records";
import { getProviderSetting, prismaProviderStore } from "@/server/repositories/provider-state";

/** The AI chain from AI_PROVIDERS, with the order and on/off overrides saved in Settings → Services applied. */
export async function loadAiProviders() {
  const setting = await getProviderSetting("ai");
  return {
    providers: orderProviders(buildAiProviders(), setting.order),
    disabled: new Set(setting.disabled),
  };
}

/** The app's AI runner. Workflows call `ai.runStructured(...)`; nothing calls a model directly (CLAUDE.md rule 8). */
export const ai = createAiRunner({
  getProviders: loadAiProviders,
  store: prismaProviderStore,
  cache: aiResultCache,
  log: logAiRequest,
});
