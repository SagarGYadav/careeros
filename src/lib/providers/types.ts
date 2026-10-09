// Shared types for provider chains (SPEC §7.2–7.3). Every external service (AI, job search, web search,
// embeddings) is a list of providers tried in order: a main provider plus free backups.

export type ServiceName = "ai" | "job_search" | "web_search" | "embeddings";

export type PeriodKind = "minute" | "day" | "month";

/** Free-tier limits we stay under. Values are safety limits set a little below each provider's published quota. */
export type QuotaLimits = Partial<Record<PeriodKind, number>>;

export type ProviderInfo = {
  /** Stable id used in settings, logs and env lists, e.g. "gemini". */
  name: string;
  /** Shown in the UI, e.g. "Google Gemini". */
  label: string;
  /** True when the keys it needs are present. Unconfigured providers are skipped. */
  configured: boolean;
  limits: QuotaLimits;
  /** Mock providers exist for development and tests; they are never counted as backups. */
  isMock?: boolean;
};

export type UsageCounts = Record<PeriodKind, number>;

export type HealthState = {
  cooldownUntil: Date | null;
  exhaustedUntil: Date | null;
  circuitOpenUntil: Date | null;
  consecutiveFailures: number;
  /** Remaining allowance as reported by the provider itself (e.g. an account endpoint), when available. */
  reportedRemaining: number | null;
  lastErrorKind: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
};

export const HEALTHY: HealthState = {
  cooldownUntil: null,
  exhaustedUntil: null,
  circuitOpenUntil: null,
  consecutiveFailures: 0,
  reportedRemaining: null,
  lastErrorKind: null,
  lastSuccessAt: null,
  lastFailureAt: null,
};

/**
 * Why a call failed, from the chain's point of view:
 * - rate_limited: too many requests right now (429) → short cooldown
 * - quota_exhausted: the daily/monthly free allowance is used up → unavailable until reset
 * - auth: key missing, wrong or revoked (401/403) → skip for an hour
 * - transient: 5xx, timeout, network → retry once, then the next provider
 * - rejected: the provider refused this request (other 4xx, e.g. model not found) → next provider
 * - invalid_output: the AI answered but not in the required shape, even after a repair attempt → next provider
 * - bug: our own error (e.g. a TypeError) → rethrown immediately, never hidden by failover
 */
export type FailureKind =
  "rate_limited" | "quota_exhausted" | "auth" | "transient" | "rejected" | "invalid_output" | "bug";

export type ClassifiedFailure = { kind: FailureKind; retryAfterMs?: number; message: string };

/** Persistence for usage counters and health. Prisma in the app, in-memory in tests. */
export interface ProviderStateStore {
  getHealth(service: ServiceName, provider: string): Promise<HealthState>;
  saveHealth(service: ServiceName, provider: string, health: HealthState): Promise<void>;
  getUsage(service: ServiceName, provider: string, now: Date): Promise<UsageCounts>;
  /** Counts one request in the current minute, day and month. */
  recordRequest(service: ServiceName, provider: string, now: Date): Promise<void>;
}
