import type { generateText, LanguageModel } from "ai";
import type { ProviderInfo } from "@/lib/providers/types";

/** Workflows ask for a capability tier, never a model name (SPEC §8.1); each provider maps tiers to its models. */
export type AiTier = "fast" | "balanced" | "strong";

export type AiProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];

export type AiProvider = ProviderInfo & {
  /** Can read a PDF file directly (Gemini). Others receive the extracted text only. */
  supportsPdf: boolean;
  models: Record<AiTier, string>;
  languageModel: (tier: AiTier) => LanguageModel;
  /** Provider-specific request options, e.g. OpenRouter's list of fallback models. */
  providerOptions?: () => AiProviderOptions;
};
