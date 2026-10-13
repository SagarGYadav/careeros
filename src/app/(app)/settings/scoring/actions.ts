"use server";

import { refresh } from "next/cache";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { resetScoringSettings, saveScoringSettings } from "@/server/services/scoring-settings";

export async function saveScoringSettingsAction(input: unknown) {
  const user = await requireUser();
  try {
    const version = await saveScoringSettings(user.id, input);
    refresh();
    return { ok: true as const, data: { version } };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function resetScoringSettingsAction() {
  const user = await requireUser();
  try {
    await resetScoringSettings(user.id);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return toErrorResult(error);
  }
}
