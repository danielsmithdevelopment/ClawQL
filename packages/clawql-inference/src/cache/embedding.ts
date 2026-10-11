import { Effect } from "effect";

export type EmbeddingConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export function resolveInferenceEmbeddingConfig(
  env: NodeJS.ProcessEnv = process.env
): EmbeddingConfig | null {
  const apiKey = env.CLAWQL_EMBEDDING_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) return null;
  return {
    baseUrl: (env.CLAWQL_EMBEDDING_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, ""),
    model: env.CLAWQL_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL,
    apiKey,
  };
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function embedTextsEffect(
  texts: string[],
  config: EmbeddingConfig
): Effect.Effect<Float32Array[], Error> {
  return Effect.gen(function* () {
    if (!texts.length) return [];
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch(`${config.baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({ model: config.model, input: texts }),
        }),
      catch: asError,
    });
    if (!res.ok) {
      const errText = yield* Effect.tryPromise({
        try: async () => (await res.text().catch(() => "")).slice(0, 400),
        catch: () => new Error("failed to read embeddings error body"),
      }).pipe(Effect.orElseSucceed(() => ""));
      return yield* Effect.fail(new Error(`embeddings HTTP ${res.status}: ${errText}`));
    }
    const json = yield* Effect.tryPromise({
      try: () =>
        res.json() as Promise<{
          data?: Array<{ embedding?: number[]; index?: number }>;
        }>,
      catch: asError,
    });
    const rows = [...(json.data ?? [])].sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
    return rows.map((row) => Float32Array.from(row.embedding ?? []));
  });
}

/** Promise façade. */
export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig
): Promise<Float32Array[]> {
  return Effect.runPromise(embedTextsEffect(texts, config));
}

export function embedQueryEffect(
  text: string,
  config: EmbeddingConfig
): Effect.Effect<Float32Array, Error> {
  return Effect.gen(function* () {
    const vectors = yield* embedTextsEffect([text], config);
    return vectors[0] ?? new Float32Array(0);
  });
}

/** Promise façade. */
export async function embedQuery(text: string, config: EmbeddingConfig): Promise<Float32Array> {
  return Effect.runPromise(embedQueryEffect(text, config));
}

export type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

export function createEmbedder(config: EmbeddingConfig): Embedder {
  return {
    embed: (text) => embedQuery(text, config),
  };
}
