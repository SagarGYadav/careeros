"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { DISMISS_REASON_KEYS } from "@/lib/jobs/feed";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { blockCompany, dismissJobs, markFeedSeen, restoreJobs, setJobsSaved } from "@/server/services/feed";

const id = z.string().min(1).max(64);
const ids = z.array(id).min(1).max(100);

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

/** Called once the feed has rendered; no refresh, so this visit keeps its "New" badges. */
export async function markFeedSeenAction() {
  const user = await requireUser();
  await markFeedSeen(user.id);
}

export async function dismissJobsAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ ids, reason: z.enum(DISMISS_REASON_KEYS).nullable() }).parse(input);
    await dismissJobs(userId, parsed.ids, parsed.reason);
  });
}

export async function restoreJobsAction(input: unknown) {
  return run(async (userId) => {
    await restoreJobs(userId, z.object({ ids }).parse(input).ids);
  });
}

export async function setJobsSavedAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ ids, saved: z.boolean() }).parse(input);
    await setJobsSaved(userId, parsed.ids, parsed.saved);
  });
}

export async function blockCompanyAction(input: unknown) {
  return run(async (userId) => {
    const parsed = z.object({ companyId: id, blocked: z.boolean() }).parse(input);
    await blockCompany(userId, parsed.companyId, parsed.blocked);
  });
}
