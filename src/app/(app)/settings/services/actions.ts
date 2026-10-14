"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { ai } from "@/server/ai/runner";
import { testEmbeddingProvider } from "@/server/embeddings/runner";
import { jobSearch } from "@/server/jobsearch/runner";
import { webSearch } from "@/server/websearch/runner";
import { moveProvider, setProviderEnabled } from "@/server/services/provider-settings";

const service = z.enum(["ai", "job_search", "embeddings", "web_search"]);
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
  const result =
    parsed.service === "ai"
      ? await ai.testProvider(parsed.name)
      : parsed.service === "job_search"
        ? await jobSearch.testProvider(parsed.name)
        : parsed.service === "web_search"
          ? await webSearch.testProvider(parsed.name)
          : await testEmbeddingProvider(parsed.name);
  refresh();
  const latency = "latencyMs" in result && result.latencyMs ? ` ${result.latencyMs} ms.` : "";
  return { ok: result.ok, message: `${result.message}${latency}` };
}
