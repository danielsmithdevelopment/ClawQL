/**
 * Optional embedding pipeline for hybrid memory (#26).
 * Vectors are stored as float32 BLOBs on `vault_chunk` (sql.js cannot load sqlite-vec); KNN runs in-process.
 */

import { getObsidianVaultPath } from "./vault-config.js";

export type EmbeddingConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;

/** `CLAWQL_VECTOR_BACKEND=sqlite` enables BLOB embeddings + recall KNN (requires vault + memory.db). */
export function vectorSqliteBackendEnabled(): boolean {
  if (process.env.CLAWQL_MEMORY_DB === "0") return false;
  if (getObsidianVaultPath() === null) return false;
  const v = process.env.CLAWQL_VECTOR_BACKEND?.trim().toLowerCase();
  return v === "sqlite";
}

export function resolveEmbeddingConfig(): EmbeddingConfig | null {
  if (!vectorSqliteBackendEnabled()) return null;
  const apiKey =
    process.env.CLAWQL_EMBEDDING_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";
  if (!apiKey) return null;
  const baseUrl = (process.env.CLAWQL_EMBEDDING_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.CLAWQL_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  return { baseUrl, model, apiKey };
}

export function float32ArrayToBlob(vec: Float32Array): Uint8Array {
  return new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToFloat32Array(blob: Uint8Array): Float32Array {
  if (blob.byteLength % 4 !== 0) {
    return new Float32Array(0);
  }
  const copy = new ArrayBuffer(blob.byteLength);
  new Uint8Array(copy).set(blob);
  return new Float32Array(copy);
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

/**
 * OpenAI-compatible `/embeddings` (batched `input` array).
 */
export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig
): Promise<{ vectors: Float32Array[]; model: string; dimension: number }> {
  if (texts.length === 0) {
    return { vectors: [], model: config.model, dimension: 0 };
  }
  const url = `${config.baseUrl}/embeddings`;
  const all: Float32Array[] = [];
  let dimension = 0;

  for (let offset = 0; offset < texts.length; offset += EMBED_BATCH) {
    const batch = texts.slice(offset, offset + EMBED_BATCH);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, input: batch }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`embeddings HTTP ${res.status}: ${errText.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const rows = json.data ?? [];
    rows.sort((x, y) => (x.index ?? 0) - (y.index ?? 0));
    for (const row of rows) {
      const emb = row.embedding;
      if (!emb?.length) continue;
      const f32 = Float32Array.from(emb);
      if (dimension === 0) dimension = f32.length;
      all.push(f32);
    }
    if (all.length !== offset + batch.length) {
      throw new Error("embeddings response size mismatch");
    }
  }

  return { vectors: all, model: config.model, dimension };
}

export async function embedQuery(text: string, config: EmbeddingConfig): Promise<Float32Array> {
  const { vectors } = await embedTexts([text], config);
  return vectors[0] ?? new Float32Array(0);
}

export type ChunkWithEmbedding = {
  documentPath: string;
  chunkId: string;
  text: string;
  embedding: Float32Array;
};

/**
 * Per-document max cosine(query, chunk); returns paths sorted by score descending.
 */
export function rankDocumentsByChunkSimilarity(
  query: Float32Array,
  chunks: ChunkWithEmbedding[],
  opts?: { topChunks?: number; maxDocs?: number }
): { path: string; score: number; chunkId: string }[] {
  const topChunks = opts?.topChunks ?? 80;
  const maxDocs = opts?.maxDocs ?? 12;

  const scored = chunks.map((c) => ({
    ...c,
    sim: cosineSimilarity(query, c.embedding),
  }));
  scored.sort((a, b) => b.sim - a.sim);
  const slice = scored.slice(0, topChunks);

  const bestByPath = new Map<string, { score: number; chunkId: string }>();
  for (const s of slice) {
    const prev = bestByPath.get(s.documentPath);
    if (!prev || s.sim > prev.score) {
      bestByPath.set(s.documentPath, { score: s.sim, chunkId: s.chunkId });
    }
  }

  const out = [...bestByPath.entries()].map(([path, v]) => ({
    path,
    score: v.score,
    chunkId: v.chunkId,
  }));
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, maxDocs);
}
