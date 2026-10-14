import { AppError, type ErrorResult } from "@/lib/errors";
import { toErrorResult } from "@/server/action-result";
import { getSessionUser } from "@/server/auth/session";
import { countFitReportsSince } from "@/server/repositories/job-analysis";
import { generateFitReport, type FitReportStage } from "@/server/services/fit-report";

// Reading the posting and writing the report can take a while with a real model.
export const maxDuration = 60;

// Each report uses two or three AI requests; this keeps a stuck page from using up the free daily quota.
const REPORTS_PER_HOUR = 30;

export type FitReportEvent =
  { type: "stage"; stage: FitReportStage } | { type: "done"; cached: boolean; passed: boolean } | ErrorResult;

function errorResponse(error: AppError) {
  const body: ErrorResult = { ok: false, code: error.code, message: error.message };
  return Response.json(body, { status: error.status });
}

/** Writes (or returns the stored) Fit Report, streaming each step as newline-delimited JSON (SPEC §21). */
export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]/fit-report">) {
  const user = await getSessionUser();
  if (!user) return errorResponse(new AppError("UNAUTHENTICATED"));
  const { jobId } = await ctx.params;
  if (!/^[\w-]{1,64}$/.test(jobId)) return errorResponse(new AppError("NOT_FOUND"));
  if ((await countFitReportsSince(user.id, new Date(Date.now() - 3_600_000))) >= REPORTS_PER_HOUR) {
    return errorResponse(
      new AppError("RATE_LIMITED", { message: "That's a lot of reports this hour. Try again later." }),
    );
  }

  const encoder = new TextEncoder();
  // Leaving the page cancels the stream, not the work: the report is still saved and shown next time.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send = (event: FitReportEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await generateFitReport(user.id, jobId, { onStage: (stage) => send({ type: "stage", stage }) });
        send({ type: "done", cached: result.cached, passed: result.validation.passed });
      } catch (error) {
        send(toErrorResult(error));
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
