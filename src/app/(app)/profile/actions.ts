"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  addSkillSchema,
  careerFactSchema,
  MAX_ACTION_PAYLOAD_CHARS,
  preferencesSchema,
  proficiencySchema,
} from "@/lib/validation/profile";
import { toErrorResult, type ActionResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import {
  createCareerFact,
  deleteCareerFact,
  setCareerFactStatus,
  updateCareerFact,
} from "@/server/repositories/career-facts";
import { confirmUserSkills, deleteUserSkill, setUserSkillProficiency } from "@/server/repositories/skills";
import {
  addSkillByName,
  confirmResume,
  saveDetailsSection,
  saveEducationSection,
  saveExperienceSection,
  savePreferencesFromForm,
  saveProjectsSection,
} from "@/server/services/profile";
import type { CvDraft } from "@/lib/cv/schema";

const id = z.string().min(1).max(64);

/** Rejects oversized payloads before Zod walks them. */
function checkSize(input: unknown) {
  if (JSON.stringify(input ?? null).length > MAX_ACTION_PAYLOAD_CHARS) {
    throw new AppError("VALIDATION", { message: "That's too much data to save at once." });
  }
}

async function run<T>(fn: (userId: string) => Promise<T>): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await fn(user.id);
    refresh();
    return { ok: true };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function confirmResumeAction(resumeId: unknown, draft: unknown) {
  return run(async (userId) => {
    checkSize(draft);
    await confirmResume(userId, id.parse(resumeId), draft as CvDraft);
  });
}

export async function saveDetailsAction(input: unknown) {
  return run(async (userId) => {
    checkSize(input);
    await saveDetailsSection(userId, input as Parameters<typeof saveDetailsSection>[1]);
  });
}

export async function saveExperienceAction(input: unknown) {
  return run(async (userId) => {
    checkSize(input);
    const { experience } = z.object({ experience: z.array(z.unknown()) }).parse(input);
    await saveExperienceSection(userId, experience as CvDraft["experience"]);
  });
}

export async function saveProjectsAction(input: unknown) {
  return run(async (userId) => {
    checkSize(input);
    const { projects } = z.object({ projects: z.array(z.unknown()) }).parse(input);
    await saveProjectsSection(userId, projects as CvDraft["projects"]);
  });
}

export async function saveEducationAction(input: unknown) {
  return run(async (userId) => {
    checkSize(input);
    await saveEducationSection(userId, input as Parameters<typeof saveEducationSection>[1]);
  });
}

export async function savePreferencesAction(input: unknown) {
  return run((userId) => savePreferencesFromForm(userId, preferencesSchema.parse(input)));
}

export async function setSkillProficiencyAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ id, proficiency: proficiencySchema }).parse(input);
    if (!(await setUserSkillProficiency(userId, parsed.id, parsed.proficiency))) throw new AppError("NOT_FOUND");
  });
}

export async function confirmSkillsAction(input: unknown) {
  return run(async (userId) => {
    await confirmUserSkills(userId, z.array(id).max(500).parse(input));
  });
}

export async function deleteSkillAction(input: unknown) {
  return run(async (userId) => {
    if (!(await deleteUserSkill(userId, id.parse(input)))) throw new AppError("NOT_FOUND");
  });
}

export async function addSkillAction(input: unknown) {
  return run(async (userId) => {
    const parsed = addSkillSchema.parse(input);
    await addSkillByName(userId, parsed.name, parsed.proficiency);
  });
}

export async function addFactAction(input: unknown) {
  return run(async (userId) => {
    await createCareerFact(userId, careerFactSchema.parse(input));
  });
}

export async function updateFactAction(input: unknown) {
  return run(async (userId) => {
    const parsed = careerFactSchema.extend({ id }).parse(input);
    if (!(await updateCareerFact(userId, parsed.id, { text: parsed.text, category: parsed.category }))) {
      throw new AppError("NOT_FOUND");
    }
  });
}

export async function setFactStatusAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ id, status: z.enum(["active", "archived"]) }).parse(input);
    if (!(await setCareerFactStatus(userId, parsed.id, parsed.status))) throw new AppError("NOT_FOUND");
  });
}

export async function deleteFactAction(input: unknown) {
  return run(async (userId) => {
    if (!(await deleteCareerFact(userId, id.parse(input)))) throw new AppError("NOT_FOUND");
  });
}
