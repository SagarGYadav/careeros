// Embedding providers (SPEC §7.2, §10.5): bge-small-en-v1.5 run locally (transformers.js), the same model on
// Cloudflare Workers AI as the backup, and a mock for tests. Both real providers use CLS pooling and unit length,
// which makes their vectors identical (measured: cosine 1.0000), so vectors from either can be compared.
import type { ProviderInfo } from "@/lib/providers/types";
import { fetchJson } from "@/lib/jobsearch/http";

export const EMBEDDING_MODEL = "bge-small-en-v1.5";
export const EMBEDDING_DIMENSIONS = 384;
/** Mock vectors are only comparable with other mock vectors; the model name travels with every vector. */
export const MOCK_EMBEDDING_MODEL = "mock-hash-384";

/** The model reads at most 512 tokens; texts are cut the same way for every provider so vectors stay equal. */
export const MAX_EMBED_CHARS = 2000;

export type EmbeddingProvider = ProviderInfo & {
  model: string;
  /** Texts per request. */
  batchSize: number;
  embed(texts: string[]): Promise<number[][]>;
};

type Env = Record<string, string | undefined>;

export const prepareText = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);

// ---------------------------------------------------------------------------------------------------------------
// Local: free, private and unlimited. The model (~130 MB, full precision so it matches Cloudflare exactly) is
// downloaded from Hugging Face on first use and cached in .cache/transformers.

type Extractor = (texts: string[], options: { pooling: "cls"; normalize: boolean }) => Promise<{ tolist(): unknown }>;
let extractor: Promise<Extractor> | null = null;

async function loadExtractor(): Promise<Extractor> {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = ".cache/transformers";
  return (await pipeline("feature-extraction", `Xenova/${EMBEDDING_MODEL}`, { dtype: "fp32" })) as unknown as Extractor;
}

export function localEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "local",
    label: "Local model (bge-small-en-v1.5)",
    configured: true,
    limits: {},
    model: EMBEDDING_MODEL,
    batchSize: 16,
    async embed(texts) {
      // A failed load is not cached, so the next call can try again (e.g. after a network blip during download).
      extractor ??= loadExtractor().catch((error) => {
        extractor = null;
        throw error;
      });
      const run = await extractor;
      const output = await run(texts.map(prepareText), { pooling: "cls", normalize: true });
      return output.tolist() as number[][];
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Cloudflare Workers AI: the same model, 10,000 free "neurons" a day (thousands of job descriptions).

export function cloudflareEmbeddingProvider(env: Env, fetchImpl: typeof fetch = fetch): EmbeddingProvider {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  return {
    name: "cloudflare",
    label: "Cloudflare Workers AI",
    configured: Boolean(accountId && token),
    limits: { minute: 60, day: 900 },
    model: EMBEDDING_MODEL,
    batchSize: 50,
    async embed(texts) {
      const data = await fetchJson<{ success: boolean; result?: { data: number[][] } }>(
        "cloudflare",
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/${EMBEDDING_MODEL}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: texts.map(prepareText), pooling: "cls" }),
          fetch: fetchImpl,
        },
      );
      if (!data.success || !data.result) throw new Error("cloudflare: no embeddings returned");
      return data.result.data;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Mock: hashed bag of words, so texts sharing words get similar vectors. Deterministic and instant.

function hash(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mockEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of prepareText(text)
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 1)) {
    const h = hash(word);
    vector[h % EMBEDDING_DIMENSIONS] += h & 1 ? 1 : -1;
  }
  const length = Math.hypot(...vector) || 1;
  return vector.map((x) => x / length);
}

export function mockEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "mock",
    label: "Mock embeddings (hashed words)",
    configured: true,
    isMock: true,
    limits: {},
    model: MOCK_EMBEDDING_MODEL,
    batchSize: 100,
    async embed(texts) {
      return texts.map(mockEmbedding);
    },
  };
}

const FACTORIES: Record<string, (env: Env) => EmbeddingProvider> = {
  local: () => localEmbeddingProvider(),
  cloudflare: (env) => cloudflareEmbeddingProvider(env),
  mock: () => mockEmbeddingProvider(),
};

export const KNOWN_EMBEDDING_PROVIDERS = Object.keys(FACTORIES);

/** Providers named in EMBEDDING_PROVIDERS, in order (default: the mock). */
export function buildEmbeddingProviders(env: Env = process.env): EmbeddingProvider[] {
  const names = (env.EMBEDDING_PROVIDERS || "mock")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name, index, all) => name && FACTORIES[name] && all.indexOf(name) === index);
  return names.map((name) => FACTORIES[name](env));
}

/** Cosine similarity of two unit-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
