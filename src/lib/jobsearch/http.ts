// Small HTTP helper shared by the job-search providers: timeouts, JSON parsing and errors the chain can classify.
import { isNetworkOrTimeoutError } from "@/lib/providers/classify";
import { classifyHttpFailure } from "@/lib/providers/classify";
import type { ClassifiedFailure } from "@/lib/providers/types";
import { ProviderHttpError } from "./types";

export const REQUEST_TIMEOUT_MS = 20_000;

export async function fetchJson<T>(
  provider: string,
  url: string,
  init: RequestInit & { fetch?: typeof fetch } = {},
): Promise<T> {
  const { fetch: fetchImpl = fetch, ...rest } = init;
  const response = await fetchImpl(url, { ...rest, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = await response.text();
  if (!response.ok) {
    throw new ProviderHttpError(provider, response.status, body.slice(0, 500), response.headers.get("retry-after"));
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ProviderHttpError(provider, 502, "Response was not JSON", null);
  }
}

/** Recognised by shape too: bundlers and test runners can load two copies of the class, which breaks instanceof. */
function isProviderHttpError(error: unknown): error is ProviderHttpError {
  if (error instanceof ProviderHttpError) return true;
  const e = error as Partial<ProviderHttpError> | null;
  return e?.name === "ProviderHttpError" && typeof e.status === "number";
}

/** Classifies job-search and embedding failures for the provider chain. */
export function classifyServiceError(error: unknown): ClassifiedFailure {
  if (isProviderHttpError(error)) {
    return classifyHttpFailure(error.status, {
      retryAfter: error.retryAfter,
      body: error.body,
      message: error.message,
    });
  }
  if (isNetworkOrTimeoutError(error)) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { kind: "transient", message: (error as Error).message, ...(timedOut && { retry: false }) };
  }
  return { kind: "bug", message: error instanceof Error ? error.message : String(error) };
}
