import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** The global skill catalogue plus this user's own (unreviewed) skills. */
export async function listSkillCatalogue(userId: string) {
  return db.skill.findMany({
    where: { ownerKey: { in: ["global", userId] } },
    select: { id: true, slug: true, name: true, aliases: true, category: true, ownerKey: true },
    orderBy: [{ ownerKey: "asc" }, { name: "asc" }],
  });
}

/** "implies" relations between catalogue skills: for each skill id, the names of the skills that imply it. */
export async function listSkillImplications(userId: string): Promise<Map<string, string[]>> {
  const rows = await db.skillRelation.findMany({
    where: { type: "implies", from: { ownerKey: { in: ["global", userId] } } },
    select: { toSkillId: true, from: { select: { name: true } } },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.toSkillId, [...(map.get(row.toSkillId) ?? []), row.from.name]);
  return map;
}

/** "implies" relations by id: for each skill id, the ids of the skills that imply it. */
export async function listSkillImplicationIds(userId: string): Promise<Map<string, string[]>> {
  const rows = await db.skillRelation.findMany({
    where: { type: "implies", from: { ownerKey: { in: ["global", userId] } } },
    select: { toSkillId: true, fromSkillId: true },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.toSkillId, [...(map.get(row.toSkillId) ?? []), row.fromSkillId]);
  return map;
}

/** A user-owned skill for a name the catalogue doesn't know; marked unreviewed. */
export function createUserOwnedSkills(userId: string, skills: { id: string; slug: string; name: string }[]) {
  return db.skill.createMany({
    data: skills.map((s) => ({ ...s, ownerKey: userId, category: "other", unreviewed: true })),
    skipDuplicates: true,
  });
}

export type UserSkillRow = {
  skillId: string;
  proficiency: number;
  proficiencyReason: string;
  years: number | null;
  lastUsedYear: number | null;
  evidenceIds: string[];
  source: "cv_section" | "cv_inferred";
};

/**
 * Inserts or refreshes skills found in a confirmed CV in one statement. A proficiency the user set themselves is
 * kept; years, recency and evidence always follow the latest CV.
 */
export function upsertCvUserSkills(userId: string, rows: UserSkillRow[]) {
  if (!rows.length) return db.$executeRaw`SELECT 1`;
  const values = rows.map(
    (r) =>
      Prisma.sql`(${randomUUID()}, ${userId}, ${r.skillId}, ${r.proficiency}, 'rule', ${r.proficiencyReason}, ${r.years}, ${r.lastUsedYear}, ${r.evidenceIds}::text[], ${r.source}, false, now(), now())`,
  );
  return db.$executeRaw`
    INSERT INTO user_skills (id, "userId", "skillId", proficiency, "proficiencySource", "proficiencyReason", years,
      "lastUsedYear", "evidenceIds", source, confirmed, "createdAt", "updatedAt")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("userId", "skillId") DO UPDATE SET
      years = EXCLUDED.years,
      "lastUsedYear" = EXCLUDED."lastUsedYear",
      "evidenceIds" = EXCLUDED."evidenceIds",
      source = CASE WHEN user_skills.source IN ('self', 'import') THEN user_skills.source ELSE EXCLUDED.source END,
      proficiency = CASE WHEN user_skills."proficiencySource" = 'user' THEN user_skills.proficiency ELSE EXCLUDED.proficiency END,
      "proficiencyReason" = CASE WHEN user_skills."proficiencySource" = 'user' THEN user_skills."proficiencyReason" ELSE EXCLUDED."proficiencyReason" END,
      "updatedAt" = now()`;
}

/** CV skills that are no longer in the CV and that the user never confirmed or rated. */
export function deleteStaleCvSkills(userId: string, keepSkillIds: string[]) {
  return db.userSkill.deleteMany({
    where: {
      userId,
      source: { in: ["cv_section", "cv_inferred"] },
      confirmed: false,
      proficiencySource: { not: "user" },
      skillId: { notIn: keepSkillIds },
    },
  });
}

export function recordSkillHistory(userId: string, entries: { skillId: string; proficiency: number }[]) {
  return db.userSkillHistory.createMany({ data: entries.map((e) => ({ userId, ...e })) });
}

export async function listUserSkills(userId: string) {
  return db.userSkill.findMany({
    where: { userId },
    include: { skill: { select: { name: true, slug: true, category: true, unreviewed: true } } },
    orderBy: [{ proficiency: "desc" }, { skill: { name: "asc" } }],
  });
}

export async function getUserSkill(userId: string, userSkillId: string) {
  return db.userSkill.findFirst({ where: { id: userSkillId, userId } });
}

/** The user's own rating: recorded in the history so growth can be shown later. */
export async function setUserSkillProficiency(userId: string, userSkillId: string, proficiency: number) {
  const skill = await db.userSkill.findFirst({ where: { id: userSkillId, userId }, select: { skillId: true } });
  if (!skill) return false;
  await db.$transaction([
    db.userSkill.update({
      where: { id: userSkillId },
      data: { proficiency, proficiencySource: "user", proficiencyReason: null, confirmed: true },
    }),
    db.userSkillHistory.create({ data: { userId, skillId: skill.skillId, proficiency } }),
  ]);
  return true;
}

export async function confirmUserSkills(userId: string, userSkillIds: string[]) {
  const { count } = await db.userSkill.updateMany({
    where: { userId, id: { in: userSkillIds } },
    data: { confirmed: true },
  });
  return count;
}

export async function deleteUserSkill(userId: string, userSkillId: string) {
  const { count } = await db.userSkill.deleteMany({ where: { id: userSkillId, userId } });
  return count === 1;
}

/** Adds a skill the user has (source "self"). Unknown names become the user's own unreviewed skill. */
export async function addSelfSkill(
  userId: string,
  skill: { existingSkillId: string | null; newSkill: { slug: string; name: string } | null },
  proficiency: number,
) {
  let skillId = skill.existingSkillId;
  if (!skillId && skill.newSkill) {
    const existing = await db.skill.findUnique({
      where: { ownerKey_slug: { ownerKey: userId, slug: skill.newSkill.slug } },
      select: { id: true },
    });
    skillId =
      existing?.id ??
      (
        await db.skill.create({
          data: { ...skill.newSkill, ownerKey: userId, category: "other", unreviewed: true },
          select: { id: true },
        })
      ).id;
  }
  if (!skillId) return null;
  const row = await db.userSkill.upsert({
    where: { userId_skillId: { userId, skillId } },
    create: { userId, skillId, proficiency, proficiencySource: "user", source: "self", confirmed: true },
    update: { proficiency, proficiencySource: "user", confirmed: true },
  });
  await db.userSkillHistory.create({ data: { userId, skillId, proficiency } });
  return row.id;
}
