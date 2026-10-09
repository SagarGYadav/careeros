import type { ProviderStatus } from "./chain";
import type { ServiceName } from "./types";

export type ServiceSummary = {
  service: ServiceName;
  label: string;
  providers: ProviderStatus[];
  /** The provider the next request would go to. */
  active: ProviderStatus | null;
  /** The first real provider with a key and switched on: what you'd normally want to use. */
  preferred: ProviderStatus | null;
  usingBackup: boolean;
  /** No real provider is usable, so answers come from the mock provider (or no-AI mode). */
  mockOnly: boolean;
  allUnavailable: boolean;
};

/** Summarises a chain's provider statuses for the header badge, the backup banner and Settings → Services. */
export function summariseService(service: ServiceName, label: string, providers: ProviderStatus[]): ServiceSummary {
  const usable = (p: ProviderStatus) => p.state === "ok" || p.state === "near_limit";
  const active = providers.find((p) => p.state === "ok") ?? providers.find(usable) ?? null;
  const preferred = providers.find((p) => p.configured && p.enabled && !p.isMock) ?? null;
  return {
    service,
    label,
    providers,
    active,
    preferred,
    usingBackup: Boolean(preferred && active && active.name !== preferred.name && !active.isMock),
    mockOnly: !preferred || Boolean(active?.isMock),
    allUnavailable: !active,
  };
}
