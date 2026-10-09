// Seeds the global skill catalogue, skill relations and the role catalogue. Idempotent: safe to run repeatedly.
// Run with `npm run db:seed` (dev DB) or `npm run db:seed:test` (test DB).
import "dotenv/config";
import { db } from "../../src/server/db";
import { buildSkillIndex } from "../../src/lib/skills/normalize";
import { ROLE_FAMILIES, SENIORITY_BANDS } from "./role-families";
import { SKILL_RELATIONS, SKILLS } from "./skills";
import { assertCatalogueConsistent } from "./validate";

async function main() {
  assertCatalogueConsistent();

  for (const skill of SKILLS) {
    const data = {
      name: skill.name,
      category: skill.category,
      aliases: skill.aliases ?? [],
      learningEffort: skill.effort ?? 2,
      resources: skill.resources ?? undefined,
    };
    await db.skill.upsert({
      where: { ownerKey_slug: { ownerKey: "global", slug: skill.slug } },
      create: { ownerKey: "global", slug: skill.slug, ...data },
      update: data,
    });
  }
  const skills = await db.skill.findMany({ where: { ownerKey: "global" } });
  const bySlug = new Map(skills.map((s) => [s.slug, s]));
  console.log(`skills: ${skills.length} (index keys: ${buildSkillIndex(skills).size})`);

  await db.skillRelation.deleteMany({ where: { from: { ownerKey: "global" }, to: { ownerKey: "global" } } });
  await db.skillRelation.createMany({
    data: SKILL_RELATIONS.map(([from, to, type]) => ({
      fromSkillId: bySlug.get(from)!.id,
      toSkillId: bySlug.get(to)!.id,
      type,
    })),
  });
  console.log(`skill relations: ${SKILL_RELATIONS.length}`);

  for (const family of ROLE_FAMILIES) {
    const data = {
      name: family.name,
      description: family.description,
      titleVariants: family.titleVariants,
      seniorityBands: SENIORITY_BANDS,
      adjacentSlugs: family.adjacent,
    };
    const saved = await db.roleFamily.upsert({
      where: { slug: family.slug },
      create: { slug: family.slug, ...data },
      update: data,
    });
    await db.roleFamilySkill.deleteMany({ where: { roleFamilyId: saved.id } });
    await db.roleFamilySkill.createMany({
      data: family.coreSkills.map((slug) => ({ roleFamilyId: saved.id, skillId: bySlug.get(slug)!.id })),
    });
  }
  console.log(`role families: ${ROLE_FAMILIES.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
