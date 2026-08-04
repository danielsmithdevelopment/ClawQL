/**
 * Embedding pipeline for hybrid memory (#26 / #28).
 * - **sqlite:** float32 BLOBs on `vault_chunk` (sql.js; in-process KNN) — **default / required** for memory.
 * - **postgres:** `CLAWQL_VECTOR_DATABASE_URL` + pgvector (`<=>` cosine in SQL).
 * - **Embedding providers:** `local` (in-process ONNX via @xenova/transformers — no API key /
 *   no Ollama) or `http` (OpenAI-compatible `/embeddings`).
 *
 * Keyword-only recall is a **measured failure mode** (worse than grep on shared-vocabulary
 * corpora). Vectors are therefore **mandatory** whenever the vault + memory.db are enabled.
 * Disabling them requires an explicit break-glass flag (tests / emergencies only).
 */

import { getObsidianVaultPath } from "../vault/config.js";
import {
  DEFAULT_LOCAL_EMBEDDING_DIMENSION,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  embedTextsLocal,
} from "./embedding-local.js";

export type EmbeddingProvider = "local" | "http";

export type EmbeddingConfig = {
  provider: EmbeddingProvider;
  /** HTTP only — OpenAI-compatible base URL. */
  baseUrl: string;
  model: string;
  /** HTTP only — Bearer token (unused for local). */
  apiKey: string;
};

/** Where chunk vectors are indexed for recall. */
export type VectorBackend = "off" | "sqlite" | "postgres";

const DEFAULT_HTTP_BASE = "https://api.openai.com/v1";
const DEFAULT_HTTP_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;

let warnedKeywordOnlyBreakGlass = false;

/**
 * Break-glass only: allow keyword+wikilink memory without vectors.
 * Required for `CLAWQL_VECTOR_BACKEND=off` / `CLAWQL_EMBEDDING_PROVIDER=off`.
 * Not a supported product mode — measured worse than grep without vectors.
 */
export function allowKeywordOnlyMemory(): boolean {
  const v = process.env.CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function warnKeywordOnlyIgnored(setting: string): void {
  if (warnedKeywordOnlyBreakGlass) return;
  warnedKeywordOnlyBreakGlass = true;
  console.warn(
    `[clawql-mcp] Ignoring ${setting}: vectors are mandatory for memory_recall ` +
      `(keyword-only measured worse than grep). Set CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY=1 only for ` +
      `tests/emergencies.`
  );
}

/**
 * Vector store selection. Default **`sqlite`**.
 * `off` is ignored unless {@link allowKeywordOnlyMemory} is set.
 */
export function vectorBackend(): VectorBackend {
  const v = process.env.CLAWQL_VECTOR_BACKEND?.trim().toLowerCase();
  if (!v) return "sqlite";
  if (v === "off" || v === "0" || v === "false" || v === "none") {
    if (allowKeywordOnlyMemory()) return "off";
    warnKeywordOnlyIgnored("CLAWQL_VECTOR_BACKEND=off");
    return "sqlite";
  }
  if (v === "sqlite" || v === "sql") return "sqlite";
  if (v === "postgres" || v === "postgresql" || v === "pg" || v === "pgvector") return "postgres";
  return "sqlite";
}

let warnedPostgresFallbackToSqlite = false;

/**
 * **Runtime** vector store: same as {@link vectorBackend} except when env requests **postgres**
 * but **`CLAWQL_VECTOR_DATABASE_URL`** is unset — then we use **sqlite** vectors in **`memory.db`**.
 */
export function effectiveVectorBackend(): VectorBackend {
  const b = vectorBackend();
  if (b === "off") return "off";
  if (b === "postgres" && !process.env.CLAWQL_VECTOR_DATABASE_URL?.trim()) {
    if (!warnedPostgresFallbackToSqlite) {
      warnedPostgresFallbackToSqlite = true;
      console.warn(
        "[clawql-mcp] CLAWQL_VECTOR_BACKEND=postgres but CLAWQL_VECTOR_DATABASE_URL is unset; using SQLite (memory.db) for vectors. Set the URL for pgvector."
      );
    }
    return "sqlite";
  }
  return b;
}

/** True when an embedding provider + vector backend are configured. */
export function vectorRecallEnabled(): boolean {
  return resolveEmbeddingConfig() !== null;
}

export type EmbeddingProviderMode = "auto" | "local" | "http" | "off";

export function embeddingProviderMode(): EmbeddingProviderMode {
  const v = process.env.CLAWQL_EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (!v || v === "auto") return "auto";
  if (v === "local" || v === "onnx" || v === "transformers") return "local";
  if (v === "http" || v === "openai" || v === "remote") return "http";
  if (v === "off" || v === "0" || v === "false" || v === "none") {
    if (allowKeywordOnlyMemory()) return "off";
    warnKeywordOnlyIgnored("CLAWQL_EMBEDDING_PROVIDER=off");
    return "auto";
  }
  return "auto";
}

/**
 * Honest status for memory_ingest `rebuild.embeddings`.
 */
export function embeddingRebuildReport(): { synced: boolean; skipped?: string } {
  if (process.env.CLAWQL_MEMORY_DB === "0") {
    return { synced: false, skipped: "CLAWQL_MEMORY_DB=0; memory.db sync disabled" };
  }
  if (vectorBackend() === "off") {
    return {
      synced: false,
      skipped:
        "CLAWQL_VECTOR_BACKEND=off with CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY=1; embeddings not written (unsupported product mode)",
    };
  }
  if (embeddingProviderMode() === "off") {
    return {
      synced: false,
      skipped:
        "CLAWQL_EMBEDDING_PROVIDER=off with CLAWQL_ALLOW_KEYWORD_ONLY_MEMORY=1; embeddings disabled (unsupported product mode)",
    };
  }
  if (!resolveEmbeddingConfig()) {
    return {
      synced: false,
      skipped:
        "Embedding provider unavailable (local MiniLM should resolve automatically when vault + memory.db are on)",
    };
  }
  return { synced: true };
}

/** @deprecated Prefer {@link vectorBackend} === `"sqlite"`. */
export function vectorSqliteBackendEnabled(): boolean {
  return vectorBackend() === "sqlite" && resolveEmbeddingConfig() !== null;
}

/**
 * Resolve embedding config.
 * - **local** (default when no API key): in-process MiniLM — no third-party daemon.
 * - **http**: OpenAI-compatible `/embeddings` when `CLAWQL_EMBEDDING_API_KEY` / `OPENAI_API_KEY` set.
 */
export function resolveEmbeddingConfig(): EmbeddingConfig | null {
  const b = vectorBackend();
  if (b === "off") return null;
  if (process.env.CLAWQL_MEMORY_DB === "0") return null;
  if (getObsidianVaultPath() === null) return null;

  const mode = embeddingProviderMode();
  if (mode === "off") return null;

  const apiKey =
    process.env.CLAWQL_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";

  const preferHttp = mode === "http" || (mode === "auto" && Boolean(apiKey));
  if (preferHttp) {
    if (!apiKey) return null;
    const baseUrl = (process.env.CLAWQL_EMBEDDING_BASE_URL?.trim() || DEFAULT_HTTP_BASE).replace(
      /\/$/,
      ""
    );
    const model = process.env.CLAWQL_EMBEDDING_MODEL?.trim() || DEFAULT_HTTP_MODEL;
    return { provider: "http", baseUrl, model, apiKey };
  }

  // local (explicit) or auto without API key — mandatory default path
  const model = process.env.CLAWQL_EMBEDDING_MODEL?.trim() || DEFAULT_LOCAL_EMBEDDING_MODEL;
  return {
    provider: "local",
    baseUrl: "",
    model,
    apiKey: "",
  };
}

/** Vector width — local MiniLM defaults to 384; HTTP OpenAI small defaults to 1536. */
export function embeddingVectorDimension(): number {
  const v = process.env.CLAWQL_EMBEDDING_DIMENSION?.trim();
  if (v) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cfg = resolveEmbeddingConfig();
  if (cfg?.provider === "local") return DEFAULT_LOCAL_EMBEDDING_DIMENSION;
  return 1536;
}

/**
 * When the **effective** backend is **postgres** (URL provided), set **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**
 * to skip float32 vectors in **`vault_chunk.embedding`**. Default **on** (dual-write).
 */
export function vectorDualWriteToMemoryDb(): boolean {
  if (effectiveVectorBackend() !== "postgres") return true;
  return process.env.CLAWQL_MEMORY_VECTOR_DUAL_WRITE !== "0";
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

async function embedTextsHttp(
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

/**
 * Embed texts via local ONNX (default) or OpenAI-compatible HTTP.
 */
export async function embedTexts(
  texts: string[],
  config: EmbeddingConfig
): Promise<{ vectors: Float32Array[]; model: string; dimension: number }> {
  if (config.provider === "local") {
    return embedTextsLocal(texts, config.model);
  }
  return embedTextsHttp(texts, config);
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

export type VectorRankedRow = {
  documentPath: string;
  chunkId: string;
  score: number;
};

/** Collapse chunk scores to one row per document (best chunk wins). */
export function aggregateScoresToDocumentBest(
  rows: VectorRankedRow[],
  maxDocs: number
): { path: string; score: number; chunkId: string }[] {
  const bestByPath = new Map<string, { score: number; chunkId: string }>();
  for (const r of rows) {
    const prev = bestByPath.get(r.documentPath);
    if (!prev || r.score > prev.score) {
      bestByPath.set(r.documentPath, { score: r.score, chunkId: r.chunkId });
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

  const scored: VectorRankedRow[] = chunks.map((c) => ({
    documentPath: c.documentPath,
    chunkId: c.chunkId,
    score: cosineSimilarity(query, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const slice = scored.slice(0, topChunks);
  return aggregateScoresToDocumentBest(slice, maxDocs);
}

export {
  DEFAULT_LOCAL_EMBEDDING_DIMENSION,
  DEFAULT_LOCAL_EMBEDDING_MODEL,
  setLocalEmbeddingOverrideForTests,
} from "./embedding-local.js";
