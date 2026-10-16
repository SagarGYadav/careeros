"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { fetchFullDescription, replaceJobDescription } from "@/server/services/add-job";
import {
  addInterviewRound,
  changeApplicationStatus,
  markAsApplied,
  undoStatusChange,
} from "@/server/services/applications";

const jobId = z.string().min(1).max(64);

export async function replaceDescriptionAction(input: unknown) {
  const user = await requireUser();
  try {
    const parsed = z.object({ jobId, description: z.string() }).parse(input);
    await replaceJobDescription(user.id, parsed.jobId, { description: parsed.description });
    refresh();
    return { ok: true as const };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function fetchDescriptionAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await fetchFullDescription(user.id, z.object({ jobId }).parse(input).jobId);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function markAppliedAction(input: unknown) {
  const user = await requireUser();
  try {
    const { jobId: id, ...values } = z.looseObject({ jobId }).parse(input);
    const result = await markAsApplied(user.id, id, values);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function changeStatusAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await changeApplicationStatus(user.id, input);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function undoStatusAction(input: unknown) {
  const user = await requireUser();
  try {
    const parsed = z.object({ applicationId: jobId, eventId: jobId }).parse(input);
    await undoStatusChange(user.id, parsed.applicationId, parsed.eventId);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function addRoundAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await addInterviewRound(user.id, input);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}
