import { createHash } from "node:crypto";
import { generateText, NoObjectGeneratedError, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  AllProvidersUnavailableError,
  healthAfterFailure,
  healthAfterSuccess,
  runWithFailover,
} from "@/lib/providers/chain";
import type { ProviderStateStore } from "@/lib/providers/types";
import { classifyAiError, InvalidOutputError } from "./errors";
import type { AiProvider, AiTier } from "./types";
import { detectInjection, UNTRUSTED_POLICY, wrapUntrusted, type UntrustedBlock } from "./untrusted";

export type StructuredRequest<T> = {
  /** Workflow id, e.g. "resume-parser". Used for logs, the cache and the mock responder. */
  workflow: string;
  /** Bump when the prompt changes, so cached answers from the old prompt are not reused. */
  promptVersion: string;
  tier: AiTier;
  /** Static, versioned system instructions. */
  system: string;
  /** Task instructions for this call (trusted, written by CareerOS). */
  instructions: string;
  untrusted?: UntrustedBlock[];
  /** Sent only to providers that read PDFs; the others get the extracted text from `untrusted`. */
  pdf?: { data: Uint8Array; filename: string };
  schema: z.ZodType<T>;
  /** Enables the per-user result cache and log attribution. */
  userId?: string;
  cache?: boolean;
  temperature?: number;
  timeoutMs?: number;
  /** What the mock provider's responder for this workflow receives. Must be JSON-serialisable. */
  mockPayload?: unknown;
  /** No-AI mode (SPEC §8.1): used when every AI provider is unavailable. */
  noAiFallback?: () => T | Promise<T>;
};

export type StructuredResult<T> = {
  output: T;
  /** "ai" = generated now, "cache" = same input answered before, "no_ai" = deterministic fallback. */
  mode: "ai" | "cache" | "no_ai";
  provider: string | null;
  model: string | null;
  fallbackFrom: string | null;
  fallbackReason: string | null;
  /** The untrusted content contained phrases that look like prompt injection (shown as a warning). */
  injectionSuspected: boolean;
  /** The first answer was invalid and the repair attempt fixed it. */
  repaired: boolean;
};

export type AiLogEntry = {
  userId?: string;
  workflow: string;
  promptVersion: string;
  provider: string;
  model: string;
  status: "ok" | "repaired" | "invalid_output" | "error";
  errorKind?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  fallbackFrom?: string | null;
  fallbackReason?: string | null;
  inputHash: string;
};

export type AiCache = {
  get(
    userId: string,
    workflow: string,
    inputHash: string,
  ): Promise<{ output: unknown; provider: string; model: string } | null>;
  put(entry: {
    userId: string;
    workflow: string;
    inputHash: string;
    promptVersion: string;
    output: unknown;
    provider: string;
    model: string;
  }): Promise<void>;
};

export type AiRunnerDeps = {
  getProviders: () => Promise<{ providers: AiProvider[]; disabled: ReadonlySet<string> }>;
  store: ProviderStateStore;
  cache?: AiCache;
  log?: (entry: AiLogEntry) => Promise<void>;
  now?: () => Date;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REPAIR_DETAIL = 1500;

export function hashInput(request: StructuredRequest<unknown>): string {
  const hash = createHash("sha256");
  hash.update(
    JSON.stringify({
      workflow: request.workflow,
      promptVersion: request.promptVersion,
      tier: request.tier,
      system: request.system,
      instructions: request.instructions,
      untrusted: request.untrusted ?? [],
    }),
  );
  if (request.pdf) hash.update(request.pdf.data);
  return hash.digest("hex");
}

/** The user message: instructions, then each untrusted block in its wrapper, then the PDF if this provider reads PDFs. */
function buildMessages(request: StructuredRequest<unknown>, provider: AiProvider): ModelMessage[] {
  const text = [request.instructions, ...(request.untrusted ?? []).map(wrapUntrusted)].join("\n\n");
  const content: Extract<ModelMessage, { role: "user" }>["content"] = [{ type: "text", text }];
  if (request.pdf && provider.supportsPdf) {
    content.push({
      type: "file",
      mediaType: "application/pdf",
      data: request.pdf.data,
      filename: request.pdf.filename,
    });
  }
  return [{ role: "user", content }];
}

function tokenCounts(usage: unknown): { inputTokens?: number; outputTokens?: number } {
  const value = (v: unknown) => (typeof v === "number" ? v : (v as { total?: number } | undefined)?.total);
  const u = usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  return { inputTokens: value(u?.inputTokens), outputTokens: value(u?.outputTokens) };
}

/**
 * runStructured (SPEC §8.1): cache → provider chain → native structured output → Zod validation → one repair
 * attempt → next provider → no-AI fallback. Every attempt is logged without its content.
 */
export function createAiRunner(deps: AiRunnerDeps) {
  const now = deps.now ?? (() => new Date());

  async function callProvider<T>(provider: AiProvider, request: StructuredRequest<T>, inputHash: string) {
    const model = provider.models[request.tier];
    const started = Date.now();
    const base = {
      model: provider.languageModel(request.tier),
      system: `${request.system}\n\n${UNTRUSTED_POLICY}`,
      output: Output.object({ schema: request.schema }),
      // The provider chain does retries and failover itself.
      maxRetries: 0,
      temperature: request.temperature,
      providerOptions: {
        ...(provider.providerOptions?.() ?? {}),
        mock: { workflow: request.workflow, payload: (request.mockPayload ?? null) as never },
      },
    };
    const messages = buildMessages(request, provider);
    const logEntry = (status: AiLogEntry["status"], extra: Partial<AiLogEntry> = {}) =>
      deps.log?.({
        userId: request.userId,
        workflow: request.workflow,
        promptVersion: request.promptVersion,
        provider: provider.name,
        model,
        status,
        latencyMs: Date.now() - started,
        inputHash,
        ...extra,
      });

    try {
      const result = await generateText({
        ...base,
        messages,
        abortSignal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      await logEntry("ok", tokenCounts(result.usage));
      return { output: result.output as T, model, repaired: false };
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) {
        await logEntry("error", { errorKind: classifyAiError(error).kind });
        throw error;
      }
      // One repair attempt: show the model its answer and what was wrong with it.
      const detail = String(error.cause instanceof Error ? error.cause.message : error.message).slice(
        0,
        MAX_REPAIR_DETAIL,
      );
      try {
        const repaired = await generateText({
          ...base,
          messages: [
            ...messages,
            { role: "assistant", content: error.text ?? "" },
            {
              role: "user",
              content: `That answer did not match the required JSON schema: ${detail}\nReply again with only the corrected JSON.`,
            },
          ],
          abortSignal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        await logEntry("repaired", tokenCounts(repaired.usage));
        return { output: repaired.output as T, model, repaired: true };
      } catch (repairError) {
        const kind = classifyAiError(repairError).kind;
        await logEntry(kind === "invalid_output" ? "invalid_output" : "error", { errorKind: kind });
        throw NoObjectGeneratedError.isInstance(repairError)
          ? new InvalidOutputError(`${request.workflow}: output did not match the schema after a repair attempt`)
          : repairError;
      }
    }
  }

  async function runStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const injectionSuspected = (request.untrusted ?? []).some((block) => detectInjection(block.text).suspected);
    const inputHash = hashInput(request as StructuredRequest<unknown>);
    const useCache = Boolean(request.userId && deps.cache && request.cache !== false);

    if (useCache) {
      const hit = await deps.cache!.get(request.userId!, request.workflow, inputHash);
      const parsed = hit ? request.schema.safeParse(hit.output) : null;
      if (hit && parsed?.success) {
        return {
          output: parsed.data,
          mode: "cache",
          provider: hit.provider,
          model: hit.model,
          fallbackFrom: null,
          fallbackReason: null,
          injectionSuspected,
          repaired: false,
        };
      }
    }

    const { providers, disabled } = await deps.getProviders();
    try {
      const run = await runWithFailover({
        service: "ai",
        providers,
        disabled,
        store: deps.store,
        now,
        classify: classifyAiError,
        call: (provider) => callProvider(provider, request, inputHash),
      });
      const { output, model, repaired } = run.result;
      // Mock answers are never cached: adding a real key should give real answers straight away.
      if (useCache && !run.provider.isMock) {
        await deps.cache!.put({
          userId: request.userId!,
          workflow: request.workflow,
          inputHash,
          promptVersion: request.promptVersion,
          output,
          provider: run.provider.name,
          model,
        });
      }
      return {
        output,
        mode: "ai",
        provider: run.provider.name,
        model,
        fallbackFrom: run.fallbackFrom,
        fallbackReason: run.fallbackReason,
        injectionSuspected,
        repaired,
      };
    } catch (error) {
      if (!(error instanceof AllProvidersUnavailableError)) throw error;
      if (request.noAiFallback) {
        return {
          output: await request.noAiFallback(),
          mode: "no_ai",
          provider: null,
          model: null,
          fallbackFrom: null,
          fallbackReason: null,
          injectionSuspected,
          repaired: false,
        };
      }
      const code = error.noneConfigured
        ? "AI_NOT_CONFIGURED"
        : error.lastFailureWasInvalidOutput
          ? "AI_INVALID_OUTPUT"
          : "AI_RATE_LIMITED";
      throw new AppError(code, { cause: error, details: { nextAvailableAt: error.nextAvailableAt?.toISOString() } });
    }
  }

  /** Settings → Services "Test connection": one tiny request to a single provider, ignoring its cooldowns. */
  async function testProvider(name: string): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
    const { providers } = await deps.getProviders();
    const provider = providers.find((p) => p.name === name);
    if (!provider) return { ok: false, message: "This provider isn't in AI_PROVIDERS." };
    if (!provider.configured) return { ok: false, message: "No API key set in .env." };
    const started = Date.now();
    await deps.store.recordRequest("ai", provider.name, now());
    try {
      await generateText({
        model: provider.languageModel("fast"),
        prompt: "Reply with the single word OK.",
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(20_000),
        providerOptions: provider.providerOptions?.(),
      });
      const health = await deps.store.getHealth("ai", provider.name);
      await deps.store.saveHealth("ai", provider.name, healthAfterSuccess(health, now()));
      return { ok: true, message: `Connected (${provider.models.fast}).`, latencyMs: Date.now() - started };
    } catch (error) {
      const failure = classifyAiError(error);
      if (failure.kind === "bug") throw error;
      const health = await deps.store.getHealth("ai", provider.name);
      await deps.store.saveHealth("ai", provider.name, healthAfterFailure(health, failure, now()));
      const messages: Record<string, string> = {
        auth: "The API key was rejected. Check it in .env.",
        rate_limited: "Rate limited right now. Try again in a minute.",
        quota_exhausted: "The free allowance is used up until it resets.",
        rejected: "The provider refused the request (check the model name in .env).",
        transient: "The provider didn't respond. Try again later.",
      };
      return { ok: false, message: messages[failure.kind] ?? "The test failed." };
    }
  }

  return { runStructured, testProvider };
}

export type AiRunner = ReturnType<typeof createAiRunner>;
