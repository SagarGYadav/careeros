import "server-only";
import { buildJobSearchProviders, createJobSearchRunner } from "@/lib/jobsearch/runner";
import { orderProviders } from "@/lib/providers/chain";
import { getProviderSetting, prismaProviderStore } from "@/server/repositories/provider-state";

/** The job-search chain from JOB_SEARCH_PROVIDERS, with Settings → Services order and on/off applied. */
export async function loadJobSearchProviders() {
  const setting = await getProviderSetting("job_search");
  return {
    providers: orderProviders(buildJobSearchProviders(), setting.order),
    disabled: new Set(setting.disabled),
  };
}

/** The app's job-search runner. Search runs call it; nothing calls a job site directly (CLAUDE.md rule 8). */
export const jobSearch = createJobSearchRunner({ getProviders: loadJobSearchProviders, store: prismaProviderStore });
