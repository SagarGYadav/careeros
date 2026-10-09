import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_GROUPS, visibleNavGroups } from "@/config/navigation";
import { AppError, describeError, isAppError } from "@/lib/errors";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { confidenceLevel } from "@/lib/stats/confidence";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { withStrictSsl } from "@/server/db-url";
import { redact } from "@/server/logger";

describe("safeRedirectPath", () => {
  it("allows same-site paths", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/jobs?tab=new")).toBe("/jobs?tab=new");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/overview");
    expect(safeRedirectPath("//evil.example")).toBe("/overview");
    expect(safeRedirectPath("/\\evil.example")).toBe("/overview");
    expect(safeRedirectPath(null)).toBe("/overview");
    expect(safeRedirectPath("", "/home")).toBe("/home");
  });
});

describe("confidenceLevel (SPEC §6 thresholds)", () => {
  it.each([
    [0, "insufficient"],
    [4, "insufficient"],
    [5, "early"],
    [14, "early"],
    [15, "moderate"],
    [39, "moderate"],
    [40, "strong"],
    [500, "strong"],
  ] as const)("n = %i is %s", (n, level) => {
    expect(confidenceLevel(n)).toBe(level);
  });
});

describe("navigation", () => {
  it("shows only enabled items and drops empty groups", () => {
    const groups = [
      { label: "A", items: [{ title: "On", href: "/on", icon: () => null, enabled: true }] },
      { label: "B", items: [{ title: "Off", href: "/off", icon: () => null, enabled: false }] },
    ];
    expect(visibleNavGroups(groups as never).map((g) => g.label)).toEqual(["A"]);
  });

  it("never exposes a disabled item from the real config", () => {
    const visible = visibleNavGroups(NAV_GROUPS).flatMap((g) => g.items);
    expect(visible.every((item) => item.enabled)).toBe(true);
    expect(visible.map((item) => item.href)).toContain("/overview");
  });

  it("matches the item and its sub-pages only", () => {
    expect(isNavItemActive("/jobs", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobs/roles", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobsearch", "/jobs")).toBe(false);
  });
});

describe("AppError", () => {
  it("carries a code, status and user-facing title", () => {
    const error = new AppError("FILE_TOO_LARGE");
    expect(isAppError(error)).toBe(true);
    expect(error.status).toBe(413);
    expect(error.message).toBe("That file is too large.");
    expect(describeError("FILE_TOO_LARGE").action).toBe("Upload a file under 5 MB");
    expect(isAppError(new Error("x"))).toBe(false);
  });
});

describe("auth validation", () => {
  it("requires a valid email and a password to sign in", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });

  it("checks password length and confirmation on sign-up", () => {
    const base = { name: "Asha", email: "a@b.co", password: "long-enough-1", confirmPassword: "long-enough-1" };
    expect(signUpSchema.safeParse(base).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, password: "short", confirmPassword: "short" }).success).toBe(false);
    const mismatch = signUpSchema.safeParse({ ...base, confirmPassword: "different-123" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });
});

describe("withStrictSsl", () => {
  it("upgrades sslmode=require to verify-full", () => {
    const url = withStrictSsl("postgresql://u:p@db.example/neondb?sslmode=require&channel_binding=require");
    expect(new URL(url).searchParams.get("sslmode")).toBe("verify-full");
    expect(new URL(url).searchParams.get("channel_binding")).toBe("require");
  });

  it("leaves URLs without sslmode or with libpq compatibility alone", () => {
    expect(withStrictSsl("postgresql://u:p@localhost:5432/db")).toBe("postgresql://u:p@localhost:5432/db");
    const compat = withStrictSsl("postgresql://u:p@h/db?uselibpqcompat=true&sslmode=require");
    expect(new URL(compat).searchParams.get("sslmode")).toBe("require");
  });
});

describe("log redaction", () => {
  it("hides secrets and personal data at any depth", () => {
    const out = redact({
      userId: "u1",
      password: "x",
      nested: { apiKey: "k", cvText: "my cv", count: 3 },
      list: [{ email: "a@b.co" }],
    });
    expect(out).toEqual({
      userId: "u1",
      password: "[redacted]",
      nested: { apiKey: "[redacted]", cvText: "[redacted]", count: 3 },
      list: [{ email: "[redacted]" }],
    });
  });
});
