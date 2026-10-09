import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth/auth";

// Better Auth serves sign-in, sign-up, sign-out and session endpoints under /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
