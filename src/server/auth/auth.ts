import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";

const env = serverEnv();

export const auth = betterAuth({
  appName: "CareerOS",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // On a deployed personal instance, set ALLOW_SIGNUP=false once your own account exists (SPEC §23).
    disableSignUp: !env.ALLOW_SIGNUP,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  // Stored in Postgres (rate_limits table) so limits hold across serverless instances. Enabled in every
  // environment, not only production, so development and e2e runs exercise it too.
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  // Must stay the last plugin: it lets Server Actions set the auth cookies.
  plugins: [nextCookies()],
});
