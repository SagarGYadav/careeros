import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createMockModel, MOCK_MODEL_ID } from "./mock";
import type { AiProvider, AiTier } from "./types";

// AI provider registry (SPEC §7.2, §8.1). AI_PROVIDERS lists the chain in order, main first: e.g.
// "gemini,groq,openrouter". Only free tiers are used. Limits are safety values a little below each free quota
// (published numbers change and sources disagree, so they are deliberately conservative).

type Env = Record<string, string | undefined>;

const tierModels = (env: Env, prefix: string, defaults: Record<AiTier, string>): Record<AiTier, string> => ({
  fast: env[`${prefix}_MODEL_FAST`] || defaults.fast,
  balanced: env[`${prefix}_MODEL_BALANCED`] || defaults.balanced,
  strong: env[`${prefix}_MODEL_STRONG`] || defaults.strong,
});

function gemini(env: Env): AiProvider {
  const apiKey = env.GEMINI_API_KEY;
  // The "-latest" aliases follow Google's current free-tier Flash models, so defaults don't go stale.
  const models = tierModels(env, "GEMINI", {
    fast: "gemini-flash-lite-latest",
    balanced: "gemini-flash-latest",
    strong: "gemini-flash-latest",
  });
  const google = createGoogleGenerativeAI({ apiKey });
  return {
    name: "gemini",
    label: "Google Gemini",
    configured: Boolean(apiKey),
    limits: { minute: 9, day: 200 },
    supportsPdf: true,
    models,
    languageModel: (tier) => google(models[tier]),
  };
}

function groq(env: Env): AiProvider {
  const apiKey = env.GROQ_API_KEY;
  const models = tierModels(env, "GROQ", {
    fast: "llama-3.1-8b-instant",
    balanced: "openai/gpt-oss-120b",
    strong: "openai/gpt-oss-120b",
  });
  const client = createGroq({ apiKey });
  return {
    name: "groq",
    label: "Groq",
    configured: Boolean(apiKey),
    limits: { minute: 25, day: 900 },
    supportsPdf: false,
    models,
    languageModel: (tier) => client(models[tier]),
  };
}

function openrouter(env: Env): AiProvider {
  const apiKey = env.OPENROUTER_API_KEY;
  // Free models come and go, so a list is tried in order (OpenRouter routes to the next one if the first fails).
  const freeModels = (env.OPENROUTER_FREE_MODELS || "openai/gpt-oss-120b:free,meta-llama/llama-3.3-70b-instruct:free")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const [primary, ...fallbacks] = freeModels;
  const client = createOpenRouter({ apiKey });
  return {
    name: "openrouter",
    label: "OpenRouter (free models)",
    configured: Boolean(apiKey) && Boolean(primary),
    limits: { minute: 15, day: 45 },
    supportsPdf: false,
    models: { fast: primary, balanced: primary, strong: primary },
    languageModel: () => client(primary),
    providerOptions: () => (fallbacks.length ? { openrouter: { models: fallbacks } } : undefined),
  };
}

function mock(): AiProvider {
  const model = createMockModel();
  return {
    name: "mock",
    label: "Mock AI (sample answers)",
    configured: true,
    isMock: true,
    limits: {},
    supportsPdf: true,
    models: { fast: MOCK_MODEL_ID, balanced: MOCK_MODEL_ID, strong: MOCK_MODEL_ID },
    languageModel: () => model,
  };
}

const FACTORIES: Record<string, (env: Env) => AiProvider> = { gemini, groq, openrouter, mock: () => mock() };

export const KNOWN_AI_PROVIDERS = Object.keys(FACTORIES);

/** Providers named in AI_PROVIDERS, in that order. Unknown names are ignored. Defaults to the mock provider. */
export function buildAiProviders(env: Env = process.env): AiProvider[] {
  const names = (env.AI_PROVIDERS || "mock")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name, index, all) => name && FACTORIES[name] && all.indexOf(name) === index);
  return names.map((name) => FACTORIES[name](env));
}
