"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ai } from "@/server/ai/runner";
import { moveProvider, setProviderEnabled } from "@/server/services/provider-settings";

// Only the AI chain exists so far; job search, web search and embeddings join in their phases.
const service = z.enum(["ai"]);
const name = z.string().min(1).max(40);

export async function moveProviderAction(input: unknown) {
  await requireUser();
  const parsed = z.object({ service, name, direction: z.enum(["up", "down"]) }).parse(input);
  await moveProvider(parsed.service, parsed.name, parsed.direction);
  refresh();
}

export async function setProviderEnabledAction(input: unknown) {
  await requireUser();
  const parsed = z.object({ service, name, enabled: z.boolean() }).parse(input);
  await setProviderEnabled(parsed.service, parsed.name, parsed.enabled);
  refresh();
}

export async function testProviderAction(input: unknown): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  const parsed = z.object({ service, name }).parse(input);
  const result = await ai.testProvider(parsed.name);
  refresh();
  return { ok: result.ok, message: result.latencyMs ? `${result.message} ${result.latencyMs} ms.` : result.message };
}
