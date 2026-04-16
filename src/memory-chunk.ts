/**
 * Chunking contract for hybrid memory (sqlite-vec / embeddings) — issue #27.
 * Strategy ids are versioned so re-index jobs can detect incompatible layouts.
 */

import { createHash } from "node:crypto";
import { stripVaultFrontmatter } from "./vault-markdown.js";

/** Default paragraph-based chunker for vault Markdown bodies. */
export const CHUNK_STRATEGY_PARAGRAPH_V1 = "paragraph_v1" as const;

export type ChunkStrategyId = typeof CHUNK_STRATEGY_PARAGRAPH_V1;

export type VaultChunkPlan = {
  strategy: ChunkStrategyId;
  indexBody: string;
  indexBodySha256: string;
  chunks: {
    ordinal: number;
    /** Inclusive start offset in `indexBody` (UTF-16 code units align with `String` indices). */
    charStart: number;
    /** Exclusive end offset in `indexBody`. */
    charEnd: number;
    text: string;
    contentSha256: string;
  }[];
};

function sha256Utf8(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * Build indexable body (post-frontmatter) and paragraph chunks.
 * Long paragraphs are split into fixed windows of at most `maxChunkChars` (no overlap in v1).
 */
export function planVaultMarkdownChunks(
  fullMarkdown: string,
  options?: { maxChunkChars?: number }
): VaultChunkPlan {
  const maxChunkChars = options?.maxChunkChars ?? envInt("CLAWQL_MEMORY_CHUNK_MAX_CHARS", 2000);
  const indexBody = stripVaultFrontmatter(fullMarkdown);
  const indexBodySha256 = sha256Utf8(indexBody);
  const chunks: VaultChunkPlan["chunks"] = [];

  if (indexBody.length === 0) {
    return { strategy: CHUNK_STRATEGY_PARAGRAPH_V1, indexBody, indexBodySha256, chunks };
  }

  const re = /\n{2,}/g;
  let last = 0;
  let ordinal = 0;
  let m: RegExpExecArray | null;
  const pushWindows = (trimmed: string, absStart: number): void => {
    if (trimmed.length <= maxChunkChars) {
      chunks.push({
        ordinal: ordinal++,
        charStart: absStart,
        charEnd: absStart + trimmed.length,
        text: trimmed,
        contentSha256: sha256Utf8(trimmed),
      });
      return;
    }
    for (let i = 0; i < trimmed.length; i += maxChunkChars) {
      const text = trimmed.slice(i, i + maxChunkChars);
      const charStart = absStart + i;
      chunks.push({
        ordinal: ordinal++,
        charStart,
        charEnd: charStart + text.length,
        text,
        contentSha256: sha256Utf8(text),
      });
    }
  };

  while ((m = re.exec(indexBody)) !== null) {
    const rawSlice = indexBody.slice(last, m.index);
    const trimmed = rawSlice.trim();
    if (trimmed.length > 0) {
      const lead = rawSlice.indexOf(trimmed);
      const absStart = last + (lead < 0 ? 0 : lead);
      pushWindows(trimmed, absStart);
    }
    last = re.lastIndex;
  }
  const tail = indexBody.slice(last);
  const trimmed = tail.trim();
  if (trimmed.length > 0) {
    const lead = tail.indexOf(trimmed);
    const absStart = last + (lead < 0 ? 0 : lead);
    pushWindows(trimmed, absStart);
  }

  return { strategy: CHUNK_STRATEGY_PARAGRAPH_V1, indexBody, indexBodySha256, chunks };
}

/** Stable chunk id for upserts and embedding dedupe (see docs/memory-db-schema.md). */
export function vaultChunkId(
  vaultRelativePath: string,
  strategy: ChunkStrategyId,
  ordinal: number,
  contentSha256: string
): string {
  const basis = `vault|${vaultRelativePath}|${strategy}|${ordinal}|${contentSha256}`;
  return createHash("sha256").update(basis, "utf8").digest("hex");
}
