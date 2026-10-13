import { getSessionUser } from "@/server/auth/session";
import { getStoredFile } from "@/server/repositories/files";

/** The original uploaded file, for the review screen's preview. Only its owner can read it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/files/[fileId]">) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { fileId } = await ctx.params;
  const file = await getStoredFile(user.id, fileId);
  if (!file) return new Response("Not found", { status: 404 });

  // An RFC 5987 filename keeps non-ASCII names intact without letting them break the header.
  const encodedName = encodeURIComponent(file.fileName);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
