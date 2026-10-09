import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// The mock provider answers like a real model, so the whole pipeline (schema validation, repair, logging, UI)
// runs without API keys. Each workflow registers a responder that builds a realistic answer from its input,
// passed through generateText's providerOptions.mock (real providers ignore that key).

export type MockPayload = { workflow: string; payload: unknown };
type Responder = (payload: unknown) => unknown;

const responders = new Map<string, Responder>();

export function registerMockResponder(workflow: string, responder: Responder) {
  responders.set(workflow, responder);
}

export const MOCK_MODEL_ID = "careeros-mock";

export function createMockModel(): LanguageModel {
  return new MockLanguageModelV4({
    provider: "mock",
    modelId: MOCK_MODEL_ID,
    doGenerate: async (options) => {
      const mock = options.providerOptions?.mock as Partial<MockPayload> | undefined;
      const responder = mock?.workflow ? responders.get(mock.workflow) : undefined;
      // A connection test (no workflow) gets a plain "OK".
      const text = responder ? JSON.stringify(responder(mock?.payload)) : "OK";
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}
