import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = new Set(["/sign-in", "/sign-up"]);

/**
 * Optimistic check only: sends visitors without a session cookie to sign-in. It does not validate the session;
 * pages and actions do that with getCurrentUser()/requireUser(). Signed-in users are *not* redirected away from
 * the sign-in page here, because a stale cookie would then bounce between pages; the page checks properly instead.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || getSessionCookie(request)) {
    return NextResponse.next();
  }
  const signIn = new URL("/sign-in", request.url);
  if (pathname !== "/") signIn.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Everything except API routes, Next.js internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
