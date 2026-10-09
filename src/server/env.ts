import "server-only";
import { z } from "zod";

// Server-side environment, validated once on first use. Errors list the variable names only, never their values.
const flag = (defaultValue: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(defaultValue)
    .transform((value) => value === "true");

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
  BETTER_AUTH_URL: z.url("must be a URL such as http://localhost:3000"),
  ALLOW_SIGNUP: flag("true"),
  ENABLE_DEMO_LOGIN: flag("false"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    const result = serverEnvSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment variables (see .env.example):\n${z.prettifyError(result.error)}`);
    }
    cached = result.data;
  }
  return cached;
}
