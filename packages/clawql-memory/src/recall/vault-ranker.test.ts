import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { buildVaultRankerStats, resolveVaultRankerModeEffect, scoreWithVaultRanker } from "./vault-ranker.js";

describe("vault IDF ranker", () => {
  it("defaults mode to idf", async () => {
    const prev = process.env.CLAWQL_MEMORY_VAULT_RANKER;
    delete process.env.CLAWQL_MEMORY_VAULT_RANKER;
    try {
      expect(await Effect.runPromise(resolveVaultRankerModeEffect())).toBe("idf");
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_MEMORY_VAULT_RANKER;
      else process.env.CLAWQL_MEMORY_VAULT_RANKER = prev;
    }
  });

  it("falls back to idf when CLAWQL_MEMORY_VAULT_RANKER=bm25 (removed in 8.0.0)", async () => {
    const prev = process.env.CLAWQL_MEMORY_VAULT_RANKER;
    process.env.CLAWQL_MEMORY_VAULT_RANKER = "bm25";
    try {
      expect(await Effect.runPromise(resolveVaultRankerModeEffect())).toBe("idf");
    } finally {
      if (prev === undefined) delete process.env.CLAWQL_MEMORY_VAULT_RANKER;
      else process.env.CLAWQL_MEMORY_VAULT_RANKER = prev;
    }
  });

  it("scores a distinctive rare-term match above an unrelated document", () => {
    const query = "orchid protocol";
    const short =
      "# Protocols\n\nThe orchid protocol identifier is orchid-77. Keep this section short.\n";
    const unrelated = "# Other\n\nunrelated content about widgets\n";
    const corpus = [short, unrelated];
    const stats = buildVaultRankerStats(corpus);
    expect(stats.mode).toBe("idf");

    const shortScore = scoreWithVaultRanker(query, short, stats);
    const unrelatedScore = scoreWithVaultRanker(query, unrelated, stats);
    expect(shortScore).toBeGreaterThan(unrelatedScore);
    expect(shortScore).toBeGreaterThan(0);
  });
});
