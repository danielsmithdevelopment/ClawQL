/**
 * memory_recall MCP tool — keyword search + wikilink graph traversal in the vault.
 * Optional vector seeds when CLAWQL_VECTOR_BACKEND is sqlite (BLOB KNN) or postgres (pgvector).
 *
 * Domain logic runs through Effect services in `src/effect/`; this module keeps types,
 * test helpers, and Promise facades.
 */

import { readVaultTextFile } from "../vault/utils.js";
import { listVaultMarkdownRelPaths } from "../vault/slug-index.js";
import { stripVaultFrontmatter } from "../vault/markdown.js";

/** Re-export for tests and callers that imported from this module. */
export { extractWikilinkTargets } from "../vault/markdown.js";

export type MemoryRecallInput = {
  query: string;
  /** Max notes to return (default from CLAWQL_MEMORY_RECALL_LIMIT). */
  limit?: number;
  /** Wikilink hops from keyword hits (default from CLAWQL_MEMORY_RECALL_MAX_DEPTH). */
  maxDepth?: number;
  /** Minimum keyword score to seed recall (default from CLAWQL_MEMORY_RECALL_MIN_SCORE). */
  minScore?: number;
};

export type RecallHit = {
  path: string;
  score: number;
  depth: number;
  reason: "keyword" | "link" | "vector";
  linkFrom?: string;
  snippet: string;
};

export type MemoryRecallResult = {
  ok: boolean;
  query?: string;
  results?: RecallHit[];
  truncated?: boolean;
  scannedFiles?: number;
  error?: string;
  /** Present when **`CLAWQL_MERKLE_ENABLED=1`**: latest Merkle root metadata, or **`null`** if no snapshot row. */
  merkleSnapshot?: {
    rootHex: string;
    leafCount: number;
    treeHeight: number;
    builtAt: string;
  } | null;
  /** When **`CLAWQL_CUCKOO_ENABLED=1`** and a filter is loaded: vector-ranked chunk ids that failed membership (stale/inconsistent). */
  cuckooVectorChunksDropped?: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function countOccurrences(hay: string, needle: string): number {
  if (needle.length < 2) return 0;
  let c = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    c++;
    i += needle.length;
  }
  return c;
}

/** Exported for tests. */
export function keywordScore(query: string, text: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    s += Math.min(countOccurrences(lower, t), 25);
  }
  return s;
}

/** Public async facade for vault recall (MCP tools, scripts). */
export async function runMemoryRecall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
  const { runMemoryEffect, memoryRecallProgram } =
    await import("../effect/memory-effect-runtime.js");
  return runMemoryEffect(memoryRecallProgram(input));
}

/** @deprecated Prefer {@link runMemoryRecall} — routes through Effect services. */
export async function executeMemoryRecall(input: MemoryRecallInput): Promise<MemoryRecallResult> {
  return runMemoryRecall(input);
}

/** Recall body (vault path already resolved) — delegates to Effect core program. */
export async function executeMemoryRecallCore(
  vault: string,
  input: MemoryRecallInput
): Promise<MemoryRecallResult> {
  const { runMemoryEffect } = await import("../effect/memory-effect-runtime.js");
  const { executeMemoryRecallCoreEffect } = await import("../effect/memory-recall-effect.js");
  return runMemoryEffect(executeMemoryRecallCoreEffect(vault, input));
}

// Re-export vault scan helpers used by integration tests
export { readVaultTextFile, listVaultMarkdownRelPaths, stripVaultFrontmatter };
