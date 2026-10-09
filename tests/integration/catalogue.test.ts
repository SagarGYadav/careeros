import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";

afterAll(() => db.$disconnect());

describe("seeded catalogue in the test database", () => {
  it("has the skill catalogue, relations and role families", async () => {
    expect(await db.skill.count({ where: { ownerKey: "global" } })).toBeGreaterThanOrEqual(150);
    expect(await db.skillRelation.count()).toBeGreaterThan(40);

    const frontend = await db.roleFamily.findUnique({
      where: { slug: "frontend" },
      include: { coreSkills: { include: { skill: true } } },
    });
    expect(frontend?.coreSkills.map((c) => c.skill.slug)).toContain("react");
  });

  it("stores relations in the right direction (Next.js implies React)", async () => {
    const nextjs = await db.skill.findUnique({
      where: { ownerKey_slug: { ownerKey: "global", slug: "nextjs" } },
      include: { relationsFrom: { include: { to: true } } },
    });
    expect(nextjs?.relationsFrom.find((r) => r.to.slug === "react")?.type).toBe("implies");
  });
});
