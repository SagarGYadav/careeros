import { afterAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth/auth";
import { db } from "@/server/db";

// Exercises the real Better Auth configuration through its request handler (the same entry point as
// /api/auth/*), against the test database.
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const EMAIL_DOMAIN = "@auth.integration.careeros.test";
const email = `user-${Date.now()}${EMAIL_DOMAIN}`;
const password = "integration-password-123"; // throwaway account in the test database, deleted below

function post(path: string, body: unknown, cookie?: string) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("auth", () => {
  it("signs up, reads the session and signs out", async () => {
    const signUp = await post("/sign-up/email", { name: "Integration User", email, password });
    expect(signUp.status).toBe(200);
    const cookie = cookieFrom(signUp);

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe(email);

    const stored = await db.user.findUnique({ where: { email }, include: { accounts: true } });
    expect(stored?.accounts[0]?.providerId).toBe("credential");
    expect(stored?.accounts[0]?.password).toBeTruthy();
    expect(stored?.accounts[0]?.password).not.toContain(password); // stored hashed

    const signOut = await post("/sign-out", {}, cookie);
    expect(signOut.status).toBe(200);
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const response = await post("/sign-in/email", { email, password: "not-the-password-1" });
    expect(response.status).toBe(401);
  });

  it("enforces the minimum password length", async () => {
    const response = await post("/sign-up/email", { name: "Short", email: `short-${email}`, password: "short" });
    expect(response.status).toBe(400);
  });
});
