"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { createTargetRole, deleteTargetRole, updateTargetRole } from "@/server/repositories/target-roles";
import { addCustomRole, suggestTargetRoles } from "@/server/services/target-roles";

const id = z.string().min(1).max(64);
const title = z.string().trim().min(2, "Enter a job title.").max(80, "Keep the title under 80 characters.");
const terms = z.array(z.string().trim().min(1).max(60)).max(20, "At most 20 items.");

export async function suggestRolesAction() {
  const user = await requireUser();
  try {
    const result = await suggestTargetRoles(user.id);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}

async function run(fn: (userId: string) => Promise<unknown>) {
  const user = await requireUser();
  try {
    await fn(user.id);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function addRoleAction(input: unknown) {
  return run(async (userId) => {
    await addCustomRole(userId, z.object({ title }).parse(input).title);
  });
}

export async function updateRoleAction(input: unknown) {
  return run(async (userId) => {
    const { id: roleId, ...data } = z
      .object({ id, title: title.optional(), titleVariants: terms.optional(), keywords: terms.optional() })
      .parse(input);
    if (!(await updateTargetRole(userId, roleId, data))) throw new AppError("NOT_FOUND");
  });
}

export async function setRoleSelectedAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ id, selected: z.boolean() }).parse(input);
    if (!(await updateTargetRole(userId, parsed.id, { selected: parsed.selected }))) throw new AppError("NOT_FOUND");
  });
}

export async function deleteRoleAction(input: unknown) {
  return run(async (userId) => {
    if (!(await deleteTargetRole(userId, id.parse(input)))) throw new AppError("NOT_FOUND");
  });
}

/** Undo for a removed role: puts it back as it was (category and seniority are recomputed anyway). */
export async function restoreRoleAction(input: unknown) {
  return run(async (userId) => {
    const role = z
      .object({
        title,
        reason: z.string().max(2000).nullable(),
        reasonVerified: z.boolean(),
        evidenceIds: z.array(z.string().regex(/^E\d+$/)).max(20),
        titleVariants: terms,
        keywords: terms,
        source: z.enum(["ai", "no_ai", "user"]),
        selected: z.boolean(),
        roleFamilyId: z.string().max(64).nullable(),
      })
      .parse(input);
    await createTargetRole(userId, role);
  });
}
