import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/safe-redirect";

/** Sends users with a *valid* session away from sign-in/sign-up. Render inside <Suspense>. */
export async function RedirectIfSignedIn() {
  const user = await getSessionUser();
  if (user) redirect(DEFAULT_SIGNED_IN_PATH);
  return null;
}
