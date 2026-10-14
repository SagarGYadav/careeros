import "server-only";
import { orderProviders } from "@/lib/providers/chain";
import { buildWebSearchProviders, createWebSearchRunner } from "@/lib/websearch/runner";
import { getProviderSetting, prismaProviderStore } from "@/server/repositories/provider-state";

/** The web-search chain from WEB_SEARCH_PROVIDERS, with Settings → Services order and on/off applied. */
export async function loadWebSearchProviders() {
  const setting = await getProviderSetting("web_search");
  return {
    providers: orderProviders(buildWebSearchProviders(), setting.order),
    disabled: new Set(setting.disabled),
  };
}

/** The app's web-search runner. Career-site discovery calls it; nothing calls a search API directly. */
export const webSearch = createWebSearchRunner({ getProviders: loadWebSearchProviders, store: prismaProviderStore });
