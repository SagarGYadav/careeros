import { AppError } from "@/lib/errors";
import { toErrorResult } from "@/server/action-result";
import { getSessionUser } from "@/server/auth/session";
import { advanceSearchRun } from "@/server/services/search-runs";

// Each call does up to ~15 s of work (SPEC §11.5).
export const maxDuration = 60;

/** Does the next slice of a search run and returns its progress. The browser calls this until the run is done. */
export async function POST(_request: Request, ctx: RouteContext<"/api/search-runs/[runId]/advance">) {
  const user = await getSessionUser();
  if (!user) return Response.json(toErrorResult(new AppError("UNAUTHENTICATED")), { status: 401 });
  const { runId } = await ctx.params;
  try {
    return Response.json({ ok: true, data: await advanceSearchRun(user.id, runId) });
  } catch (error) {
    const result = toErrorResult(error);
    return Response.json(result, { status: result.code === "NOT_FOUND" ? 404 : 500 });
  }
}
