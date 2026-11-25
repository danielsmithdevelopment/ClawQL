/**
 * In-process embeddings via @xenova/transformers (ONNX / WASM).
 * No API key, no Ollama daemon — model downloads once into a cache dir on first use.
 */

import { Effect } from "effect";
import { MemoryError } from "../effect/memory-errors.js";
import { memoryFromPromise } from "../effect/memory-effect-utils.js";

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

function embeddingLoadTimeoutMs(): number {
  const raw = process.env.CLAWQL_EMBEDDING_LOAD_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  // Node 25: onnxruntime often fails protobuf parse then hangs on WASM fallback.
  return 45_000;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadPipeline(model: string): Promise<LocalEmbedFn> {
  if (embedOverride) return embedOverride;
  if (cachedEmbed && cachedModelId === model) return cachedEmbed;

  const { pipeline, env } = await import("@xenova/transformers");
  const cacheDir = localCacheDir();
  if (cacheDir) {
    env.cacheDir = cacheDir;
  }
  // Audit 4.04 / CI: offline installs must not hang on Hugging Face / WASM downloads.
  const offline =
    process.env.CLAWQL_BUNDLED_OFFLINE?.trim() === "1" ||
    process.env.TRANSFORMERS_OFFLINE?.trim() === "1";
  env.allowRemoteModels = !offline;
  // Pin revision when set (checksum / revision pin for regulated installs).
  const revision = process.env.CLAWQL_EMBEDDING_MODEL_REVISION?.trim() || undefined;

  const loadMs = embeddingLoadTimeoutMs();
  const extractor = await withTimeout(
    Promise.resolve(pipeline("feature-extraction", model, revision ? { revision } : undefined)),
    loadMs,
    `local embedding pipeline(${model})`
  );
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

export function embedTextsLocalEffect(
  texts: string[],
  model: string
): Effect.Effect<{ vectors: Float32Array[]; model: string; dimension: number }, MemoryError> {
  return memoryFromPromise(async () => {
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
  });
}

/** Promise façade. */
export async function embedTextsLocal(
  texts: string[],
  model: string
): Promise<{ vectors: Float32Array[]; model: string; dimension: number }> {
  return Effect.runPromise(embedTextsLocalEffect(texts, model));
}
