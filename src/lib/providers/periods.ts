import type { PeriodKind } from "./types";

// Usage is counted in UTC periods. Some providers reset at another time of day (Gemini at midnight Pacific);
// counting in UTC can then be slightly off near the boundary, and the provider's own 429 response covers that.

export function periodStart(kind: PeriodKind, now: Date): Date {
  const d = new Date(now);
  if (kind === "minute") {
    d.setUTCSeconds(0, 0);
  } else if (kind === "day") {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

/** When the current period ends, i.e. when a used-up limit becomes available again. */
export function nextReset(kind: PeriodKind, now: Date): Date {
  const start = periodStart(kind, now);
  if (kind === "minute") return new Date(start.getTime() + 60_000);
  if (kind === "day") return new Date(start.getTime() + 24 * 3600_000);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export const PERIOD_KINDS: PeriodKind[] = ["minute", "day", "month"];
