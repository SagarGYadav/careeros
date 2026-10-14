"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { toErrorResult } from "@/server/action-result";
import { requireUser } from "@/server/auth/session";
import { addToWatchlist, discoverCareerSites, removeCareerSite } from "@/server/services/career-sites";

export async function discoverSitesAction() {
  const user = await requireUser();
  try {
    const summary = await discoverCareerSites(user.id);
    refresh();
    return { ok: true as const, data: summary };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function addToWatchlistAction(input: unknown) {
  const user = await requireUser();
  try {
    const result = await addToWatchlist(user.id, input);
    refresh();
    return { ok: true as const, data: result };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function removeSiteAction(input: unknown) {
  const user = await requireUser();
  try {
    await removeCareerSite(user.id, z.object({ id: z.string().min(1).max(64) }).parse(input).id);
    refresh();
    return { ok: true as const };
  } catch (error) {
    return toErrorResult(error);
  }
}
