import { nextReset, PERIOD_KINDS } from "./periods";
import type {
  ClassifiedFailure,
  HealthState,
  PeriodKind,
  ProviderInfo,
  ProviderStateStore,
  ServiceName,
  UsageCounts,
} from "./types";

// Failover rules (SPEC §7.3). Pure functions plus one runner, so every rule is unit-tested.

/** Switch to the next provider at 90% of a limit, so the main provider is never pushed into hard failures. */
export const SOFT_LIMIT_RATIO = 0.9;
export const CIRCUIT_FAILURE_THRESHOLD = 3;
export const CIRCUIT_OPEN_MS = 10 * 60_000;
export const AUTH_FAILURE_PAUSE_MS = 60 * 60_000;
export const BASE_COOLDOWN_MS = 60_000;
export const MAX_COOLDOWN_MS = 10 * 60_000;

export type UnavailableReason =
  "not_configured" | "disabled" | "cooling_down" | "quota_exhausted" | "circuit_open" | "near_limit" | "limit_reached";

export type Availability =
  { available: true; nearLimit: boolean } | { available: false; reason: UnavailableReason; until: Date | null };

const REASON_TEXT: Record<UnavailableReason, string> = {
  not_configured: "no API key set",
  disabled: "turned off in settings",
  cooling_down: "rate limited, cooling down",
  quota_exhausted: "free allowance used up",
  circuit_open: "paused after repeated errors",
  near_limit: "close to its free limit",
  limit_reached: "free limit reached",
};

export function describeReason(reason: UnavailableReason): string {
  return REASON_TEXT[reason];
}

/**
 * Whether a provider can take a request now. With `allowReserve`, the last 10% of each limit may be used:
 * the runner only does that after every provider was skipped at the soft limit.
 */
export function checkAvailability(
  provider: ProviderInfo,
  health: HealthState,
  usage: UsageCounts,
  now: Date,
  options: { disabled?: boolean; allowReserve?: boolean } = {},
): Availability {
  if (!provider.configured) return { available: false, reason: "not_configured", until: null };
  if (options.disabled) return { available: false, reason: "disabled", until: null };
  if (health.exhaustedUntil && health.exhaustedUntil > now) {
    return { available: false, reason: "quota_exhausted", until: health.exhaustedUntil };
  }
  if (health.circuitOpenUntil && health.circuitOpenUntil > now) {
    return { available: false, reason: "circuit_open", until: health.circuitOpenUntil };
  }
  if (health.cooldownUntil && health.cooldownUntil > now) {
    return { available: false, reason: "cooling_down", until: health.cooldownUntil };
  }
  if (health.reportedRemaining !== null && health.reportedRemaining <= 0) {
    return { available: false, reason: "limit_reached", until: nextReset("month", now) };
  }

  let nearLimit = false;
  for (const kind of PERIOD_KINDS) {
    const limit = provider.limits[kind];
    if (!limit) continue;
    const used = usage[kind];
    if (used >= limit) return { available: false, reason: "limit_reached", until: nextReset(kind, now) };
    if (used >= Math.floor(limit * SOFT_LIMIT_RATIO)) {
      if (!options.allowReserve) return { available: false, reason: "near_limit", until: nextReset(kind, now) };
      nearLimit = true;
    }
  }
  return { available: true, nearLimit };
}

export function healthAfterSuccess(health: HealthState, now: Date, reportedRemaining?: number | null): HealthState {
  return {
    ...health,
    cooldownUntil: null,
    circuitOpenUntil: null,
    consecutiveFailures: 0,
    reportedRemaining: reportedRemaining === undefined ? health.reportedRemaining : reportedRemaining,
    lastSuccessAt: now,
  };
}

export function healthAfterFailure(health: HealthState, failure: ClassifiedFailure, now: Date): HealthState {
  const failures = health.consecutiveFailures + 1;
  const next: HealthState = {
    ...health,
    consecutiveFailures: failures,
    lastErrorKind: failure.kind,
    lastFailureAt: now,
  };
  const at = (ms: number) => new Date(now.getTime() + ms);

  switch (failure.kind) {
    case "rate_limited": {
      // Respect Retry-After; otherwise back off 1, 2, 4, 8 … minutes, at most 10.
      const backoff = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * 2 ** Math.min(failures - 1, 4));
      next.cooldownUntil = at(Math.min(MAX_COOLDOWN_MS, failure.retryAfterMs ?? backoff));
      break;
    }
    case "quota_exhausted":
      next.exhaustedUntil = failure.retryAfterMs ? at(failure.retryAfterMs) : nextReset("day", now);
      break;
    case "auth":
      next.circuitOpenUntil = at(AUTH_FAILURE_PAUSE_MS);
      break;
    default:
      if (failures >= CIRCUIT_FAILURE_THRESHOLD) next.circuitOpenUntil = at(CIRCUIT_OPEN_MS);
  }
  return next;
}

export type AttemptRecord = {
  provider: string;
  outcome: "skipped" | "failed" | "succeeded";
  /** Unavailable reason or failure kind. */
  reason?: string;
};

export class AllProvidersUnavailableError extends Error {
  constructor(
    readonly service: ServiceName,
    readonly attempts: AttemptRecord[],
    /** Earliest time any provider becomes available again, when known. */
    readonly nextAvailableAt: Date | null,
    /** True when no real (non-mock) provider has keys at all. */
    readonly noneConfigured: boolean,
  ) {
    super(`No ${service} provider is available right now.`);
    this.name = "AllProvidersUnavailableError";
  }

  /** True when the last real failures were unusable AI answers rather than limits or outages. */
  get lastFailureWasInvalidOutput(): boolean {
    const failed = this.attempts.filter((a) => a.outcome === "failed");
    return failed.length > 0 && failed.every((a) => a.reason === "invalid_output");
  }
}

export type FailoverResult<P extends ProviderInfo, R> = {
  result: R;
  provider: P;
  attempts: AttemptRecord[];
  /** The preferred provider that could not be used, when a backup answered instead. */
  fallbackFrom: string | null;
  fallbackReason: string | null;
};

type RunOptions<P extends ProviderInfo, R> = {
  service: ServiceName;
  /** In priority order: main provider first. */
  providers: P[];
  disabled?: ReadonlySet<string>;
  store: ProviderStateStore;
  now?: () => Date;
  call: (provider: P) => Promise<R>;
  classify: (error: unknown) => ClassifiedFailure;
  /** Called after every failed attempt, e.g. to log it. */
  onFailure?: (provider: P, failure: ClassifiedFailure) => void | Promise<void>;
};

/**
 * Tries providers in order until one succeeds (SPEC §7.3):
 * 1. skip providers that are unconfigured, disabled, cooling down, exhausted, paused, or at 90% of a limit;
 * 2. a transient error is retried once, other failures move straight to the next provider;
 * 3. if every provider was skipped only for being near a limit, a second pass uses the reserved last 10%.
 */
export async function runWithFailover<P extends ProviderInfo, R>(
  options: RunOptions<P, R>,
): Promise<FailoverResult<P, R>> {
  const { service, providers, store, call, classify } = options;
  const now = options.now ?? (() => new Date());
  const attempts: AttemptRecord[] = [];
  const nearLimit: P[] = [];
  const untilTimes: Date[] = [];
  let preferred: { name: string; reason: string } | null = null;

  const noteUnusable = (provider: P, reason: string) => {
    if (!preferred && provider.configured && !provider.isMock && !options.disabled?.has(provider.name)) {
      preferred = { name: provider.name, reason };
    }
  };

  const tryProvider = async (provider: P): Promise<FailoverResult<P, R> | null> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await store.recordRequest(service, provider.name, now());
      try {
        const result = await call(provider);
        const health = await store.getHealth(service, provider.name);
        await store.saveHealth(service, provider.name, healthAfterSuccess(health, now()));
        attempts.push({ provider: provider.name, outcome: "succeeded" });
        const fallback = preferred && preferred.name !== provider.name ? preferred : null;
        return {
          result,
          provider,
          attempts,
          fallbackFrom: fallback?.name ?? null,
          fallbackReason: fallback?.reason ?? null,
        };
      } catch (error) {
        const failure = classify(error);
        if (failure.kind === "bug") throw error;
        const health = await store.getHealth(service, provider.name);
        await store.saveHealth(service, provider.name, healthAfterFailure(health, failure, now()));
        await options.onFailure?.(provider, failure);
        if (failure.kind === "transient" && attempt === 1) continue;
        attempts.push({ provider: provider.name, outcome: "failed", reason: failure.kind });
        noteUnusable(provider, failure.kind);
        return null;
      }
    }
    return null;
  };

  for (const provider of providers) {
    const health = await store.getHealth(service, provider.name);
    const usage = await store.getUsage(service, provider.name, now());
    const availability = checkAvailability(provider, health, usage, now(), {
      disabled: options.disabled?.has(provider.name),
    });
    if (!availability.available) {
      attempts.push({ provider: provider.name, outcome: "skipped", reason: availability.reason });
      noteUnusable(provider, availability.reason);
      if (availability.until) untilTimes.push(availability.until);
      if (availability.reason === "near_limit") nearLimit.push(provider);
      continue;
    }
    const success = await tryProvider(provider);
    if (success) return success;
  }

  // Second pass: everything usable was only "near" a limit, so spend the reserve rather than fail.
  for (const provider of nearLimit) {
    const success = await tryProvider(provider);
    if (success) return success;
  }

  const noneConfigured = !providers.some((p) => p.configured && !p.isMock);
  const nextAvailableAt = untilTimes.length ? new Date(Math.min(...untilTimes.map((d) => d.getTime()))) : null;
  throw new AllProvidersUnavailableError(service, attempts, nextAvailableAt, noneConfigured);
}

/** Applies Settings → Services overrides: saved order first, then any providers not in it, in env order. */
export function orderProviders<P extends { name: string }>(providers: P[], savedOrder: readonly string[]): P[] {
  const byName = new Map(providers.map((p) => [p.name, p]));
  const ordered = savedOrder.map((name) => byName.get(name)).filter((p): p is P => Boolean(p));
  return [...ordered, ...providers.filter((p) => !savedOrder.includes(p.name))];
}

export type ProviderStatus = {
  name: string;
  label: string;
  isMock: boolean;
  configured: boolean;
  enabled: boolean;
  state: "ok" | "near_limit" | UnavailableReason;
  /** Plain-language status, e.g. "free limit reached". */
  description: string;
  until: Date | null;
  usage: { kind: PeriodKind; used: number; limit: number }[];
  lastSuccessAt: Date | null;
};

/** Status of one provider for Settings → Services and the backup banner. */
export function providerStatus(
  provider: ProviderInfo,
  health: HealthState,
  usage: UsageCounts,
  now: Date,
  enabled: boolean,
): ProviderStatus {
  const availability = checkAvailability(provider, health, usage, now, { disabled: !enabled, allowReserve: true });
  const strict = checkAvailability(provider, health, usage, now, { disabled: !enabled });
  const state: ProviderStatus["state"] = availability.available
    ? strict.available
      ? "ok"
      : "near_limit"
    : availability.reason;
  return {
    name: provider.name,
    label: provider.label,
    isMock: Boolean(provider.isMock),
    configured: provider.configured,
    enabled,
    state,
    description: state === "ok" ? "available" : describeReason(state),
    until: availability.available ? (strict.available ? null : strict.until) : availability.until,
    usage: PERIOD_KINDS.filter((kind) => provider.limits[kind]).map((kind) => ({
      kind,
      used: usage[kind],
      limit: provider.limits[kind]!,
    })),
    lastSuccessAt: health.lastSuccessAt,
  };
}
