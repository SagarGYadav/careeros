import "server-only";
import { ZodError } from "zod";
import { AppError, isAppError, type ErrorResult } from "@/lib/errors";
import { logger, newCorrelationId } from "@/server/logger";

export type ActionResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { data: T })) | ErrorResult;

/**
 * Turns an error from a Server Action into a safe, serialisable result: AppErrors keep their code and message,
 * invalid input becomes VALIDATION, anything else is logged with a reference and shown as INTERNAL.
 */
export function toErrorResult(error: unknown): ErrorResult {
  if (isAppError(error)) return { ok: false, code: error.code, message: error.message };
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first?.path.length ? ` (${first.path.join(".")})` : "";
    return { ok: false, code: "VALIDATION", message: `${first?.message ?? "Invalid input"}${where}` };
  }
  const correlationId = newCorrelationId();
  logger.error("server action failed", { error, correlationId });
  const internal = new AppError("INTERNAL");
  return { ok: false, code: internal.code, message: internal.message, correlationId };
}
