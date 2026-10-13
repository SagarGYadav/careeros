import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, RetryError } from "ai";
import { classifyHttpFailure, isNetworkOrTimeoutError } from "@/lib/providers/classify";
import type { ClassifiedFailure } from "@/lib/providers/types";

/** The model answered twice (original + repair attempt) without matching the required schema. */
export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

/** Maps AI SDK and network errors onto the provider chain's failure kinds (src/lib/providers/types.ts). */
export function classifyAiError(error: unknown): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof InvalidOutputError || NoObjectGeneratedError.isInstance(error)) {
    return { kind: "invalid_output", message };
  }
  if (RetryError.isInstance(error)) return classifyAiError(error.lastError);
  if (APICallError.isInstance(error)) {
    if (error.statusCode) {
      const headers = error.responseHeaders ?? {};
      return classifyHttpFailure(error.statusCode, {
        retryAfter: headers["retry-after"] ?? headers["Retry-After"],
        body: error.responseBody,
        message,
      });
    }
    return { kind: "transient", message };
  }
  if (LoadAPIKeyError.isInstance(error)) return { kind: "auth", message };
  // A request that used its whole time budget is not retried on the same provider: the backup gets the time.
  if (isNetworkOrTimeoutError(error)) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { kind: "transient", message, ...(timedOut && { retry: false }) };
  }
  return { kind: "bug", message };
}
