import "server-only";
import { buildEmbeddingProviders } from "@/lib/embeddings/providers";
import { createEmbeddingRunner } from "@/lib/embeddings/runner";
import { orderProviders } from "@/lib/providers/chain";
import { getProviderSetting, prismaProviderStore } from "@/server/repositories/provider-state";

/** The embedding chain from EMBEDDING_PROVIDERS, with Settings → Services order and on/off applied. */
export async function loadEmbeddingProviders() {
  const setting = await getProviderSetting("embeddings");
  return {
    providers: orderProviders(buildEmbeddingProviders(), setting.order),
    disabled: new Set(setting.disabled),
  };
}

export const embeddings = createEmbeddingRunner({ getProviders: loadEmbeddingProviders, store: prismaProviderStore });

/** Settings → Services "Test": embeds one short text with a single provider. */
export async function testEmbeddingProvider(name: string): Promise<{ ok: boolean; message: string }> {
  const { providers } = await loadEmbeddingProviders();
  const provider = providers.find((p) => p.name === name);
  if (!provider) return { ok: false, message: "This provider isn't in EMBEDDING_PROVIDERS." };
  if (!provider.configured) return { ok: false, message: "Not configured in .env." };
  const started = Date.now();
  try {
    const [vector] = await provider.embed(["React developer with Next.js experience"]);
    return { ok: true, message: `Connected: ${vector.length} dimensions in ${Date.now() - started} ms.` };
  } catch {
    return { ok: false, message: "The test failed. Check the settings in .env." };
  }
}
