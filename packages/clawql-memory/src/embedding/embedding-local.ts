/**
 * In-process embeddings via @xenova/transformers (ONNX / WASM).
 * No API key, no Ollama daemon — model downloads once into a cache dir on first use.
 */

export const DEFAULT_LOCAL_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
/** all-MiniLM-L6-v2 output width. */
export const DEFAULT_LOCAL_EMBEDDING_DIMENSION = 384;

export type LocalEmbedFn = (texts: string[]) => Promise<Float32Array[]>;

let cachedEmbed: LocalEmbedFn | null = null;
let cachedModelId: string | null = null;
/** Test seam — inject a deterministic embedder without downloading weights. */
let embedOverride: LocalEmbedFn | null = null;

export function setLocalEmbeddingOverrideForTests(fn: LocalEmbedFn | null): void {
  embedOverride = fn;
  cachedEmbed = null;
  cachedModelId = null;
}

function localCacheDir(): string | undefined {
  const v = process.env.CLAWQL_EMBEDDING_CACHE_DIR?.trim();
  return v || undefined;
}

async function loadPipeline(model: string): Promise<LocalEmbedFn> {
  if (embedOverride) return embedOverride;
  if (cachedEmbed && cachedModelId === model) return cachedEmbed;

  const { pipeline, env } = await import("@xenova/transformers");
  const cacheDir = localCacheDir();
  if (cacheDir) {
    env.cacheDir = cacheDir;
  }
  // Allow remote model fetch on first use (cached thereafter).
  env.allowRemoteModels = true;

  const extractor = await pipeline("feature-extraction", model);
  const embed: LocalEmbedFn = async (texts) => {
    const out: Float32Array[] = [];
    for (const text of texts) {
      const result = await extractor(text, { pooling: "mean", normalize: true });
      // xenova returns Tensor-like with .data
      const data = (result as { data?: ArrayLike<number> }).data;
      if (!data) {
        throw new Error("local embedding: empty tensor");
      }
      out.push(Float32Array.from(data));
    }
    return out;
  };

  cachedEmbed = embed;
  cachedModelId = model;
  return embed;
}

export async function embedTextsLocal(
  texts: string[],
  model: string
): Promise<{ vectors: Float32Array[]; model: string; dimension: number }> {
  if (texts.length === 0) {
    return { vectors: [], model, dimension: 0 };
  }
  const embed = await loadPipeline(model);
  const vectors = await embed(texts);
  const dimension = vectors[0]?.length ?? 0;
  if (vectors.length !== texts.length) {
    throw new Error("local embedding: batch size mismatch");
  }
  return { vectors, model, dimension };
}
