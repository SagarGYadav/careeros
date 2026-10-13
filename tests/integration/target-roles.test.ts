// Target roles from a confirmed CV, with the mock AI (which answers with the deterministic suggester).
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { listTargetRoles, updateTargetRole } from "@/server/repositories/target-roles";
import { processCvUpload } from "@/server/services/cv-pipeline";
import { confirmResume } from "@/server/services/profile";
import { addCustomRole, listTargetRolesView, suggestTargetRoles } from "@/server/services/target-roles";

const EMAIL_DOMAIN = "@roles.integration.careeros.test";
const NOW = new Date("2026-10-13T10:00:00Z");
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  [userId, otherUserId] = [randomUUID(), randomUUID()];
  await db.user.createMany({
    data: [
      { id: userId, name: "Roles Test", email: `r-${userId}${EMAIL_DOMAIN}` },
      { id: otherUserId, name: "Other", email: `o-${otherUserId}${EMAIL_DOMAIN}` },
    ],
  });
  const bytes = new Uint8Array(readFileSync("fixtures/cv/ananya-single-column.pdf"));
  const { resumeId, draft } = await processCvUpload(userId, { fileName: "ananya.pdf", bytes }, { now: NOW });
  await confirmResume(userId, resumeId, draft, NOW);
});

afterAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: EMAIL_DOMAIN } } });
  await db.$disconnect();
});

describe("target roles", () => {
  it("suggests catalog roles with verified reasons, computed category and seniority, and selects Core ones", async () => {
    const result = await suggestTargetRoles(userId);
    expect(result).toMatchObject({ mode: "ai", provider: "mock" });
    expect(result.added).toBeGreaterThanOrEqual(3);

    const { roles } = await listTargetRolesView(userId);
    const frontend = roles.find((r) => r.title === "Frontend Developer")!;
    // Jul 2021 – Mar 2023 and Apr 2023 – Oct 2026: 64 months, so senior.
    expect(frontend).toMatchObject({ seniority: "senior", reasonVerified: true });
    expect(frontend.evidence.length).toBeGreaterThan(0);
    expect(frontend.titleVariants).toContain("Front End Engineer");
    const selected = roles.filter((r) => r.selected);
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((r) => r.category === "core")).toBe(true);
  });

  it("keeps selected and user-added roles when suggesting again, without duplicates", async () => {
    const custom = await addCustomRole(userId, "Frontend Engineer");
    expect(custom.roleFamilyId).not.toBeNull();
    const before = await listTargetRoles(userId);
    const kept = before.find((r) => r.source === "ai" && !r.selected)!;
    await updateTargetRole(userId, kept.id, { selected: true });

    await suggestTargetRoles(userId);
    const after = await listTargetRoles(userId);
    expect(after.map((r) => r.id)).toEqual(expect.arrayContaining([custom.id, kept.id]));
    const suggested = after.filter((r) => r.source !== "user").map((r) => r.roleFamilyId);
    expect(new Set(suggested).size).toBe(suggested.length);
  });

  it("keeps each user's roles private", async () => {
    expect(await listTargetRoles(otherUserId)).toEqual([]);
    const someone = (await listTargetRoles(userId))[0];
    expect(await updateTargetRole(otherUserId, someone.id, { selected: false })).toBe(false);
  });
});
