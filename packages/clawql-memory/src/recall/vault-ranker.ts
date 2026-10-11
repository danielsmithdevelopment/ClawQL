/**
 * Vault lexical ranker for memory_recall.
 * - idf: corpus IDF × log-saturated TF (shipped default since #801; only mode —
 *   bm25 (Okapi, length-normalized) was eval-only and purged in 8.0.0 as a wash vs IDF,
 *   see docs/releases/8.0.0-purge-inventory-spec-v0.1.md)
 */

import { Context, Effect, Layer } from "effect";
import { buildCorpusIdf, keywordScore, type TermIdf } from "./recall.js";

export type VaultRankerMode = "idf";

export type VaultRankerStats = { mode: "idf"; idf: TermIdf };

export function buildVaultRankerStats(documents: readonly string[]): VaultRankerStats {
  return { mode: "idf", idf: buildCorpusIdf(documents) };
}

export function scoreWithVaultRanker(query: string, text: string, stats: VaultRankerStats): number {
  return keywordScore(query, text, stats.idf);
}

let warnedRemovedBm25Mode = false;

/**
 * Env: CLAWQL_MEMORY_VAULT_RANKER=idf (only mode). `bm25` was removed in 8.0.0 — if an operator
 * still sets it, warn once and fall back to `idf` rather than silently no-op-ing.
 */
export function resolveVaultRankerModeEffect(): Effect.Effect<VaultRankerMode> {
  return Effect.sync(() => {
    const v = process.env.CLAWQL_MEMORY_VAULT_RANKER?.trim().toLowerCase();
    if (v === "bm25" && !warnedRemovedBm25Mode) {
      warnedRemovedBm25Mode = true;
      console.warn(
        "[clawql] CLAWQL_MEMORY_VAULT_RANKER=bm25 was removed in 8.0.0 (purge — wash vs IDF). Using idf."
      );
    }
    return "idf";
  });
}

export function buildVaultRankerStatsEffect(
  documents: readonly string[]
): Effect.Effect<VaultRankerStats> {
  return Effect.sync(() => buildVaultRankerStats(documents));
}

export function scoreWithVaultRankerEffect(
  query: string,
  text: string,
  stats: VaultRankerStats
): Effect.Effect<number> {
  return Effect.sync(() => scoreWithVaultRanker(query, text, stats));
}

export class VaultRankerService extends Context.Service<
  VaultRankerService,
  {
    readonly resolveMode: () => Effect.Effect<VaultRankerMode>;
    readonly buildStats: (documents: readonly string[]) => Effect.Effect<VaultRankerStats>;
    readonly score: (query: string, text: string, stats: VaultRankerStats) => Effect.Effect<number>;
  }
>()("clawql/VaultRankerService") {}

export function vaultRankerLiveLayer(): Layer.Layer<VaultRankerService> {
  return Layer.succeed(
    VaultRankerService,
    VaultRankerService.of({
      resolveMode: resolveVaultRankerModeEffect,
      buildStats: buildVaultRankerStatsEffect,
      score: scoreWithVaultRankerEffect,
    })
  );
}
