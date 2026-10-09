import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** The narrow user shape passed around the app. Never pass the raw session object to the client. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/**
 * Reads and validates the session for this request. Returns null when signed out.
 * Use in Server Actions and Route Handlers: they must re-check auth close to the data (SPEC §23).
 */
export async function getSessionUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}

/** Like getSessionUser, but redirects to sign-in when there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * For Server Components. Must be called inside a <Suspense> boundary (it reads the request).
 * "use cache: private" lets several components on the same page share one session read; the result stays in the
 * browser's router cache only, never in a server cache (see node_modules/next/dist/docs, "use cache: private").
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  "use cache: private";
  return requireUser();
}
