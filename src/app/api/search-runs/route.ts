import { AppError } from "@/lib/errors";
import { toErrorResult } from "@/server/action-result";
import { getSessionUser } from "@/server/auth/session";
import { startSearchRun } from "@/server/services/search-runs";

/** Starts a job search for the selected target roles (or returns the run already in progress). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json(toErrorResult(new AppError("UNAUTHENTICATED")), { status: 401 });
  try {
    return Response.json({ ok: true, data: await startSearchRun(user.id) });
  } catch (error) {
    const result = toErrorResult(error);
    return Response.json(result, { status: result.code === "VALIDATION" ? 400 : 500 });
  }
}
