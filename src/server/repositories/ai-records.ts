import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AiCache, AiLogEntry } from "@/lib/ai/runner";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

/** Per-user cache of validated AI outputs (rows are deleted with the user). */
export const aiResultCache: AiCache = {
  async get(userId, workflow, inputHash) {
    const row = await db.aiResultCache.findUnique({
      where: { userId_workflow_inputHash: { userId, workflow, inputHash } },
    });
    return row ? { output: row.output, provider: row.provider, model: row.model } : null;
  },

  async put({ userId, workflow, inputHash, promptVersion, output, provider, model }) {
    const data = { promptVersion, output: output as Prisma.InputJsonValue, provider, model };
    await db.aiResultCache.upsert({
      where: { userId_workflow_inputHash: { userId, workflow, inputHash } },
      create: { userId, workflow, inputHash, ...data },
      update: data,
    });
  },
};

/** Records one AI attempt (no prompt or output content). A logging failure never breaks the AI call itself. */
export async function logAiRequest(entry: AiLogEntry): Promise<void> {
  try {
    await db.aiRequestLog.create({
      data: {
        userId: entry.userId ?? null,
        workflow: entry.workflow,
        promptVersion: entry.promptVersion,
        provider: entry.provider,
        model: entry.model,
        status: entry.status,
        errorKind: entry.errorKind ?? null,
        inputTokens: entry.inputTokens ?? null,
        outputTokens: entry.outputTokens ?? null,
        latencyMs: entry.latencyMs,
        fallbackFrom: entry.fallbackFrom ?? null,
        fallbackReason: entry.fallbackReason ?? null,
        inputHash: entry.inputHash,
      },
    });
  } catch (error) {
    logger.warn("ai request log failed", { error });
  }
}
