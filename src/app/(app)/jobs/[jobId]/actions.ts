"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { fetchFullDescription, replaceJobDescription } from "@/server/services/add-job";

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
