import { createAuthClient } from "better-auth/react";

// Browser-side auth client. It calls the /api/auth/* endpoints on the same origin.
export const authClient = createAuthClient();
