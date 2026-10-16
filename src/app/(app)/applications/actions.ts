"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import {
  addInterviewRound,
  changeApplicationStatus,
  markAsApplied,
  undoStatusChange,
} from "@/server/services/applications";
import { addTimelineNote, saveNotes, setFollowUp, setOfferDecision, updateRound } from "@/server/services/pipeline";

const id = z.string().min(1).max(64);

/** Runs a service call for the signed-in user and refreshes the page that called it. */
async function run<T>(call: (userId: string) => Promise<T>) {
  const user = await requireUser();
  try {
    const data = await call(user.id);
    refresh();
    return { ok: true as const, data };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function markAppliedAction(input: unknown) {
  return run((userId) => {
    const { jobId, ...values } = z.looseObject({ jobId: id }).parse(input);
    return markAsApplied(userId, jobId, values);
  });
}

export async function changeStatusAction(input: unknown) {
  return run((userId) => changeApplicationStatus(userId, input));
}

export async function undoStatusAction(input: unknown) {
  return run((userId) => {
    const parsed = z.object({ applicationId: id, eventId: id }).parse(input);
    return undoStatusChange(userId, parsed.applicationId, parsed.eventId);
  });
}

export async function addRoundAction(input: unknown) {
  return run((userId) => addInterviewRound(userId, input));
}

export async function updateRoundAction(input: unknown) {
  return run((userId) => updateRound(userId, input));
}

export async function setFollowUpAction(input: unknown) {
  return run((userId) => setFollowUp(userId, input));
}

export async function saveNotesAction(input: unknown) {
  return run((userId) => saveNotes(userId, input));
}

export async function addTimelineNoteAction(input: unknown) {
  return run((userId) => addTimelineNote(userId, input));
}

export async function setOfferDecisionAction(input: unknown) {
  return run((userId) => setOfferDecision(userId, input));
}
