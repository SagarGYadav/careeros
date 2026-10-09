import type { ClassifiedFailure } from "./types";

/** Parses a Retry-After header (seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

// Providers answer 429 both for "too fast" and for "free allowance used up". These words in the response body
// mean the daily or monthly allowance is gone, so a short cooldown would not help.
const QUOTA_WORDS =
  /quota|per[ _-]?day|perday|daily|per[ _-]?month|monthly|exhausted|insufficient credits|limit reached/i;

/**
 * Classifies an HTTP failure from any provider. Used by AI calls (via AI SDK errors) and by our own HTTP
 * clients for job and web search.
 */
export function classifyHttpFailure(
  status: number,
  options: { retryAfter?: string | null; body?: string | null; message?: string } = {},
): ClassifiedFailure {
  const message = options.message ?? `HTTP ${status}`;
  const retryAfterMs = parseRetryAfter(options.retryAfter);
  if (status === 429 || status === 402) {
    const body = options.body ?? "";
    // A long Retry-After (over an hour) also means the allowance, not the rate, is the problem.
    if (status === 402 || QUOTA_WORDS.test(body) || (retryAfterMs ?? 0) > 3600_000) {
      return { kind: "quota_exhausted", retryAfterMs, message };
    }
    return { kind: "rate_limited", retryAfterMs, message };
  }
  if (status === 401 || status === 403) return { kind: "auth", message };
  if (status === 408 || status >= 500) return { kind: "transient", retryAfterMs, message };
  return { kind: "rejected", message };
}

/** Timeouts and dropped connections, whichever library raised them. */
export function isNetworkOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError") return true;
  const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
  return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_SOCKET"].includes(code ?? "");
}
