import { redirect } from "next/navigation";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/safe-redirect";

// Signed-out visitors never reach this page: proxy.ts sends them to /sign-in first.
// A public landing page replaces this in Phase 14.
export default function Home() {
  redirect(DEFAULT_SIGNED_IN_PATH);
}
