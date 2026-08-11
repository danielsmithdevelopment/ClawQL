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

export type OntologySchemaName =
  "legal.Matter" | "legal.Client" | "legal.Attorney" | "legal.Document";

export type OntologyFilterPredicate = Record<string, unknown>;
export type OntologyFilterMap = Record<string, OntologyFilterPredicate>;
export type OntologyConfidenceMinimum = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";

export type MemoryRecallInput = {
  query: string;
  /** Max notes to return (default from CLAWQL_MEMORY_RECALL_LIMIT). */
  limit?: number;
  /** Wikilink hops from keyword hits (default from CLAWQL_MEMORY_RECALL_MAX_DEPTH). */
  maxDepth?: number;
  /** Minimum keyword score to seed recall (default from CLAWQL_MEMORY_RECALL_MIN_SCORE). */
  minScore?: number;
  /**
   * Which backends to query: `vault` | `vector` | `codegraph` | `pageindex` | `onyx`.
   * Omit for defaults (vault + vector; plus hybrid env flags / includeCodeGraph).
   * Ignored when `schema` + `filters` select structured ontology recall.
   */
  sources?: MemoryRecallSource[];
  /** When true, include codegraph even if hybrid env flag is off (same as sources including codegraph). */
  includeCodeGraph?: boolean;
  /** Code graph id for hybrid supplement (default CLAWQL_CODEGRAPH_ID or repo name). */
  codeGraphId?: string;
  /**
   * Ontology schema for structured predicate recall (requires `filters`).
   * Spec: docs/specs/memory/memory-recall-structured-filter-v0.1.md
   */
  schema?: OntologySchemaName;
  /** Typed field predicates against ontology.db (requires `schema`). */
  filters?: OntologyFilterMap;
  /** Minimum extraction confidence for ontology hits (default EXTRACTED). */
  confidenceMinimum?: OntologyConfidenceMinimum;
};

export type RecallHit = {
  path: string;
  score: number;
  depth: number;
  reason: "keyword" | "link" | "vector" | "codegraph" | "structured_predicate";
  linkFrom?: string;
  snippet: string;
};

export type CodeGraphRecallHit = {
  nodeId: string;
  name: string;
  kind: string;
  filePath?: string;
  score: number;
  snippet?: string;
};

export type {
  MemoryRecallSource,
  NormalizedRecallHit,
  RecallFollowUpHint,
} from "./recall-sources.js";
export {
  MEMORY_RECALL_SOURCES,
  resolveMemoryRecallSources,
  mapVaultResultToNormalizedHit,
  hybridPageIndexRecallEnabled,
  hybridOnyxRecallEnabled,
} from "./recall-sources.js";
import type {
  MemoryRecallSource,
  NormalizedRecallHit,
  RecallFollowUpHint,
} from "./recall-sources.js";

export type MemoryRecallResult = {
  ok: boolean;
  query?: string;
  /** Vault-side hits (keyword / link / vector) — backward compatible. */
  results?: RecallHit[];
  /** Structural code symbol hits when codegraph source is enabled. */
  codeGraphHits?: CodeGraphRecallHit[];
  /**
   * Normalized multi-source hits (vault, vector, link, codegraph, pageindex, onyx).
   * Prefer this for new agent workflows; `results` / `codeGraphHits` remain for compatibility.
   */
  hits?: NormalizedRecallHit[];
  /** Specialist tool hints when deeper ops are useful. */
  followUps?: RecallFollowUpHint[];
  /** Sources that were actually queried (after default resolution). */
  sourcesUsed?: MemoryRecallSource[];
  /** Per-source skip reasons (disabled, missing index, missing inject, …). */
  sourceNotes?: Partial<Record<MemoryRecallSource, string>>;
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
  /**
   * OKF index-first survey (`index.md` + recent `log.md`) — cheap catalog before full bodies.
   * Present when index-first is enabled (default) and vault/vector sources are queried.
   */
  indexSurvey?: import("./index-survey.js").OkfIndexSurvey;
  /** True when full bodies were loaded only for catalog/vector candidates (large vault). */
  indexFirstBodyLoad?: boolean;
  /** Paths whose bodies were loaded when index-first body restriction applied. */
  bodiesLoaded?: number;
  /** Present for structured ontology recall (`schema` + `filters`). */
  queryType?: "structured_predicate" | "schema_typed_semantic" | "semantic";
  indexUsed?: "ontology" | "vector" | "vault" | "hybrid";
  schema?: OntologySchemaName;
  filters?: OntologyFilterMap;
  scannedEntities?: number;
  filteredEntities?: number;
  confidenceMinimum?: OntologyConfidenceMinimum;
  /** Present on structured-path failures (e.g. `ontology_disabled` when CLAWQL_ONTOLOGY_DB=0). */
  errorType?: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Exported for tests and IDF helpers. */
export function tokenizeQuery(text: string): string[] {
  return tokenize(text);
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

/** Smooth IDF: log(1 + N / (1 + df)). Higher weight for rarer corpus terms. */
export type TermIdf = ReadonlyMap<string, number>;

/**
 * Build corpus-level IDF from document texts (document frequency, not raw TF).
 * Fixes keyword recall burying distinctive matches under ubiquitous tokens
 * (e.g. "chainlink" in ~1/3 of notes).
 */
export function buildCorpusIdf(documents: readonly string[]): Map<string, number> {
  const n = documents.length;
  const df = new Map<string, number>();
  for (const doc of documents) {
    const seen = new Set(tokenize(doc));
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  if (n === 0) return idf;
  for (const [t, d] of df) {
    idf.set(t, Math.log(1 + n / (1 + d)));
  }
  return idf;
}

/**
 * Keyword score with optional corpus IDF.
 * Without `idf`, each matched term contributes its capped TF (legacy behavior).
 * With `idf`, score = Σ log(1 + tf(t)) × idf(t) so rare query terms dominate and
 * repeated ubiquitous tokens cannot overwhelm distinctive matches.
 */
export function keywordScore(query: string, text: string, idf?: TermIdf): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let s = 0;
  for (const t of terms) {
    const tf = Math.min(countOccurrences(lower, t), 25);
    if (tf === 0) continue;
    if (idf) {
      const w = idf.get(t) ?? Math.log(2); // unseen query term: mild default
      s += Math.log(1 + tf) * w;
    } else {
      s += tf;
    }
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
