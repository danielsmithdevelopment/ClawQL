export type EmbeddingConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

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

export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig
): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const res = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model: config.model, input: texts }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`embeddings HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = [...(json.data ?? [])].sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
  return rows.map((row) => Float32Array.from(row.embedding ?? []));
}

export async function embedQuery(text: string, config: EmbeddingConfig): Promise<Float32Array> {
  const vectors = await embedTexts([text], config);
  return vectors[0] ?? new Float32Array(0);
}

export type Embedder = {
  embed(text: string): Promise<Float32Array>;
};

export function createEmbedder(config: EmbeddingConfig): Embedder {
  return {
    embed: (text) => embedQuery(text, config),
  };
}
