import "server-only";
import { db } from "@/server/db";

export type TargetRoleInput = {
  roleFamilyId: string | null;
  title: string;
  reason: string | null;
  reasonVerified: boolean;
  evidenceIds: string[];
  titleVariants: string[];
  keywords: string[];
  source: "ai" | "no_ai" | "user";
  selected: boolean;
};

/** The role catalog (global, read-only): every family with its core skills. */
export async function listRoleFamilies() {
  return db.roleFamily.findMany({
    orderBy: { name: "asc" },
    include: { coreSkills: { include: { skill: { select: { id: true, name: true, slug: true } } } } },
  });
}

export async function listTargetRoles(userId: string) {
  return db.targetRole.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { roleFamily: { select: { slug: true, name: true, seniorityBands: true } } },
  });
}

/**
 * Replaces earlier suggestions with new ones in one transaction. Roles the user added or selected are kept; new
 * suggestions that duplicate a kept role are skipped by the caller.
 */
export async function replaceSuggestedRoles(userId: string, roles: TargetRoleInput[]) {
  const kept = await db.targetRole.count({ where: { userId } });
  await db.$transaction([
    db.targetRole.deleteMany({ where: { userId, source: { in: ["ai", "no_ai"] }, selected: false } }),
    db.targetRole.createMany({
      data: roles.map((role, index) => ({ ...role, userId, sortOrder: kept + index })),
    }),
  ]);
}

export async function createTargetRole(userId: string, role: TargetRoleInput) {
  const last = await db.targetRole.findFirst({ where: { userId }, orderBy: { sortOrder: "desc" } });
  return db.targetRole.create({ data: { ...role, userId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
}

export async function updateTargetRole(
  userId: string,
  id: string,
  data: Partial<Pick<TargetRoleInput, "title" | "titleVariants" | "keywords" | "selected">>,
) {
  const { count } = await db.targetRole.updateMany({ where: { id, userId }, data });
  return count === 1;
}

export async function setSelectedRoles(userId: string, ids: string[]) {
  await db.targetRole.updateMany({ where: { userId, id: { in: ids } }, data: { selected: true } });
}

export async function deleteTargetRole(userId: string, id: string) {
  const { count } = await db.targetRole.deleteMany({ where: { id, userId } });
  return count === 1;
}
