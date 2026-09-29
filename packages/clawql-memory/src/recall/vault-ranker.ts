/**
 * Vault lexical rankers for memory_recall.
 * - idf: corpus IDF × log-saturated TF (shipped default since #801)
 * - bm25: Okapi BM25 with length normalization (candidate for default-route A/B)
 */

import { Context, Effect, Layer } from "effect";
import { buildCorpusIdf, keywordScore, tokenizeQuery, type TermIdf } from "./recall.js";

export type VaultRankerMode = "idf" | "bm25";

export type Bm25Params = {
  k1: number;
  b: number;
};

export type VaultRankerStats =
  | { mode: "idf"; idf: TermIdf }
  | {
      mode: "bm25";
      idf: TermIdf;
      avgdl: number;
      params: Bm25Params;
    };

const DEFAULT_BM25: Bm25Params = { k1: 1.2, b: 0.75 };

function tokenize(text: string): string[] {
  return tokenizeQuery(text);
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

/** Okapi-style IDF: ln(1 + (N - df + 0.5) / (df + 0.5)). */
export function buildBm25Idf(documents: readonly string[]): Map<string, number> {
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
    idf.set(t, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
  }
  return idf;
}

export function averageDocLengthTokens(documents: readonly string[]): number {
  if (documents.length === 0) return 0;
  let total = 0;
  for (const doc of documents) {
    total += tokenize(doc).length;
  }
  return total / documents.length;
}

export function buildVaultRankerStats(
  documents: readonly string[],
  mode: VaultRankerMode,
  params: Bm25Params = DEFAULT_BM25
): VaultRankerStats {
  if (mode === "bm25") {
    return {
      mode: "bm25",
      idf: buildBm25Idf(documents),
      avgdl: averageDocLengthTokens(documents) || 1,
      params,
    };
  }
  return { mode: "idf", idf: buildCorpusIdf(documents) };
}

/**
 * Okapi BM25 over the same substring-TF tokenization as keywordScore.
 * Length normalization is the differentiator vs IDF+log-TF on uneven section sizes.
 */
export function bm25Score(
  query: string,
  text: string,
  stats: Extract<VaultRankerStats, { mode: "bm25" }>
): number {
  const terms = tokenize(query);
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  const dl = Math.max(tokenize(text).length, 1);
  const { k1, b } = stats.params;
  const avgdl = stats.avgdl || 1;
  let s = 0;
  for (const t of terms) {
    const tf = Math.min(countOccurrences(lower, t), 25);
    if (tf === 0) continue;
    const idf = stats.idf.get(t) ?? Math.log(1 + 1); // unseen: mild
    const denom = tf + k1 * (1 - b + (b * dl) / avgdl);
    s += idf * ((tf * (k1 + 1)) / denom);
  }
  return s;
}

export function scoreWithVaultRanker(query: string, text: string, stats: VaultRankerStats): number {
  if (stats.mode === "bm25") {
    return bm25Score(query, text, stats);
  }
  return keywordScore(query, text, stats.idf);
}

/** Env: CLAWQL_MEMORY_VAULT_RANKER=idf|bm25 (default idf). */
export function resolveVaultRankerModeEffect(): Effect.Effect<VaultRankerMode> {
  return Effect.sync(() => {
    const v = process.env.CLAWQL_MEMORY_VAULT_RANKER?.trim().toLowerCase();
    return v === "bm25" ? "bm25" : "idf";
  });
}

export function buildVaultRankerStatsEffect(
  documents: readonly string[],
  mode: VaultRankerMode
): Effect.Effect<VaultRankerStats> {
  return Effect.sync(() => buildVaultRankerStats(documents, mode));
}

export function scoreWithVaultRankerEffect(
  query: string,
  text: string,
  stats: VaultRankerStats
): Effect.Effect<number> {
  return Effect.sync(() => scoreWithVaultRanker(query, text, stats));
}

export class VaultRankerService extends Context.Tag("clawql/VaultRankerService")<
  VaultRankerService,
  {
    readonly resolveMode: () => Effect.Effect<VaultRankerMode>;
    readonly buildStats: (
      documents: readonly string[],
      mode: VaultRankerMode
    ) => Effect.Effect<VaultRankerStats>;
    readonly score: (
      query: string,
      text: string,
      stats: VaultRankerStats
    ) => Effect.Effect<number>;
  }
>() {}

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
