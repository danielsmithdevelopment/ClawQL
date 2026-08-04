/**
 * Reciprocal Rank Fusion across multi-source memory_recall hits.
 * Merges vault/vector/link/codegraph/pageindex/onyx lists into one ranked list
 * without requiring calibrated cross-source scores (agent-memory-stack composition).
 */

import type { NormalizedRecallHit } from "./recall-sources.js";

export type RrfOptions = {
  /** RRF constant k (default 60). */
  k?: number;
  /** Max results to return. */
  limit?: number;
};

/**
 * Fuse ranked lists via Reciprocal Rank Fusion.
 * Each input list should already be sorted best-first.
 * Hits with the same `source:id` key accumulate 1/(k+rank).
 */
export function reciprocalRankFusion(
  lists: readonly (readonly NormalizedRecallHit[])[],
  opts?: RrfOptions
): NormalizedRecallHit[] {
  const k = opts?.k ?? 60;
  const limit = opts?.limit ?? 20;
  const scores = new Map<string, { hit: NormalizedRecallHit; rrf: number }>();

  for (const list of lists) {
    list.forEach((hit, idx) => {
      // Fuse same document across sources by path when available (vault/vector/link).
      const key = hit.path?.replace(/\\/g, "/") || `${hit.source}:${hit.id}`;
      const add = 1 / (k + idx + 1);
      const prev = scores.get(key);
      if (!prev) {
        scores.set(key, { hit: { ...hit }, rrf: add });
      } else {
        prev.rrf += add;
        // Keep the richer snippet / higher native score as payload.
        if (hit.score > prev.hit.score) {
          prev.hit = { ...hit };
        }
      }
    });
  }

  const out = [...scores.values()]
    .sort((a, b) => b.rrf - a.rrf || b.hit.score - a.hit.score)
    .slice(0, Math.max(0, limit))
    .map(({ hit, rrf }) => ({
      ...hit,
      score: rrf,
      meta: { ...(hit.meta ?? {}), rrf, nativeScore: hit.score },
    }));
  return out;
}

/**
 * Partition normalized hits by source, then RRF-merge.
 * Prefer this over raw score sort when sources use incompatible scales.
 */
export function rerankNormalizedHitsRrf(
  hits: readonly NormalizedRecallHit[],
  opts?: RrfOptions
): NormalizedRecallHit[] {
  const bySource = new Map<string, NormalizedRecallHit[]>();
  for (const h of hits) {
    const key = h.source;
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key)!.push(h);
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => b.score - a.score);
  }
  return reciprocalRankFusion([...bySource.values()], opts);
}

/** Master hybrid switch: CLAWQL_MEMORY_RECALL_HYBRID=1 enables optional layers by default. */
export function hybridRecallMasterEnabled(): boolean {
  const v = process.env.CLAWQL_MEMORY_RECALL_HYBRID?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
