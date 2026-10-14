"use server";

import { z } from "zod";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { addJob, readJobFromUrl } from "@/server/services/add-job";

export async function readJobFromUrlAction(input: unknown) {
  await requireUser();
  try {
    const { url } = z.object({ url: z.string().trim().min(1, "Enter a link.").max(2_000) }).parse(input);
    return { ok: true as const, data: await readJobFromUrl(url) };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function addJobAction(input: unknown) {
  const user = await requireUser();
  try {
    return { ok: true as const, data: await addJob(user.id, input) };
  } catch (error) {
    return toErrorResult(error);
  }
}
