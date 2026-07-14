/**
 * memory_recall source selection and normalized multi-source hit/followUp helpers.
 */

export const MEMORY_RECALL_SOURCES = [
  "vault",
  "vector",
  "codegraph",
  "pageindex",
  "onyx",
] as const;

export type MemoryRecallSource = (typeof MEMORY_RECALL_SOURCES)[number];

/** Normalized hit for multi-source recall (preferred agent-facing surface). */
export type NormalizedRecallHit = {
  /** Backend that produced this hit. `link` is vault wikilink expansion. */
  source: MemoryRecallSource | "link";
  /** Stable id within that source (vault path, nodeId, citation key, …). */
  id: string;
  score: number;
  snippet: string;
  path?: string;
  title?: string;
  meta?: Record<string, unknown>;
};

/** Hint to call a specialist MCP tool after hybrid recall. */
export type RecallFollowUpHint = {
  tool: string;
  reason: string;
  args?: Record<string, unknown>;
};

export function isMemoryRecallSource(v: unknown): v is MemoryRecallSource {
  return typeof v === "string" && (MEMORY_RECALL_SOURCES as readonly string[]).includes(v);
}

export function envFlagTruthy(key: string): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Env-gated hybrid pageindex merge into memory_recall defaults. */
export function hybridPageIndexRecallEnabled(): boolean {
  return envFlagTruthy("CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX");
}

/** Env-gated hybrid Onyx merge into memory_recall defaults. */
export function hybridOnyxRecallEnabled(): boolean {
  return envFlagTruthy("CLAWQL_MEMORY_RECALL_HYBRID_ONYX");
}

/**
 * Resolve which sources to query.
 * - Explicit `sources` wins.
 * - Default (unset): vault + vector (as today) + optional hybrids from env / includeCodeGraph.
 */
export function resolveMemoryRecallSources(input: {
  sources?: MemoryRecallSource[];
  includeCodeGraph?: boolean;
  hybridCodeGraphEnabled?: boolean;
}): Set<MemoryRecallSource> {
  if (input.sources && input.sources.length > 0) {
    return new Set(input.sources.filter(isMemoryRecallSource));
  }
  const s = new Set<MemoryRecallSource>(["vault", "vector"]);
  if (
    input.includeCodeGraph === true ||
    (input.includeCodeGraph !== false && input.hybridCodeGraphEnabled)
  ) {
    s.add("codegraph");
  }
  if (hybridPageIndexRecallEnabled()) s.add("pageindex");
  if (hybridOnyxRecallEnabled()) s.add("onyx");
  return s;
}

export function mapVaultResultToNormalizedHit(hit: {
  path: string;
  score: number;
  depth: number;
  reason: "keyword" | "link" | "vector" | "codegraph";
  linkFrom?: string;
  snippet: string;
}): NormalizedRecallHit {
  const source: NormalizedRecallHit["source"] =
    hit.reason === "vector" ? "vector" : hit.reason === "link" ? "link" : "vault";
  return {
    source,
    id: hit.path,
    score: hit.score,
    snippet: hit.snippet,
    path: hit.path,
    meta: {
      depth: hit.depth,
      reason: hit.reason,
      ...(hit.linkFrom ? { linkFrom: hit.linkFrom } : {}),
    },
  };
}
