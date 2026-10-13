import { MAX_CV_BYTES } from "@/lib/cv/files";
import { AppError, isAppError, type ErrorResult } from "@/lib/errors";
import { toErrorResult } from "@/server/action-result";
import { getSessionUser } from "@/server/auth/session";
import { countResumeUploadsSince } from "@/server/repositories/resumes";
import { processCvUpload, type CvPipelineStage } from "@/server/services/cv-pipeline";

// Each upload runs the AI chain once or twice; this keeps a stuck client or script from using up the free quota.
const UPLOADS_PER_HOUR = 20;

export type CvUploadEvent =
  | { type: "stage"; stage: CvPipelineStage }
  | { type: "done"; resumeId: string; mode: "ai" | "cache" | "no_ai"; provider: string | null }
  | ErrorResult;

function errorResponse(error: AppError) {
  const body: ErrorResult = { ok: false, code: error.code, message: error.message };
  return Response.json(body, { status: error.status });
}

/**
 * CV upload. Answers with newline-delimited JSON progress events (SPEC §21 long operations) so the page can show
 * each step, ending with "done" (the resume version to review) or an error.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return errorResponse(new AppError("UNAUTHENTICATED"));

  let file: File;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (!(value instanceof File)) throw new AppError("VALIDATION", { message: "Choose a file to upload." });
    if (value.size > MAX_CV_BYTES) throw new AppError("FILE_TOO_LARGE");
    file = value;
  } catch (error) {
    return errorResponse(
      isAppError(error) ? error : new AppError("VALIDATION", { message: "Couldn't read the upload." }),
    );
  }

  if ((await countResumeUploadsSince(user.id, new Date(Date.now() - 60 * 60 * 1000))) >= UPLOADS_PER_HOUR) {
    return errorResponse(
      new AppError("RATE_LIMITED", { message: "That's a lot of uploads this hour. Try again later." }),
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoder = new TextEncoder();
  // If the browser leaves the page, the stream is cancelled but the upload carries on and is saved for review;
  // progress events are then simply dropped.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send = (event: CvUploadEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await processCvUpload(
          user.id,
          { fileName: file.name, bytes },
          { onStage: (stage) => send({ type: "stage", stage }) },
        );
        send({ type: "done", resumeId: result.resumeId, mode: result.parse.mode, provider: result.parse.provider });
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
