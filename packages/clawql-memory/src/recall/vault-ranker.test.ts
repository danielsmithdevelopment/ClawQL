import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  bm25Score,
  buildVaultRankerStats,
  resolveVaultRankerModeEffect,
  scoreWithVaultRanker,
} from "./vault-ranker.js";

describe("vault BM25 ranker", () => {
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

  it("prefers short distinctive docs over long TF-spam under BM25", () => {
    const query = "orchid protocol";
    const short =
      "# Protocols\n\nThe orchid protocol identifier is orchid-77. Keep this section short.\n";
    // Long doc repeats common words and buries the rare term once at the end.
    const long =
      "# Misc\n\n" +
      ("protocol protocol protocol handbook handbook handbook section section ".repeat(80) +
        "\norchid is mentioned once in a sea of boilerplate.\n");
    const corpus = [short, long, "# Other\n\nunrelated content about widgets\n"];
    const bm25 = buildVaultRankerStats(corpus, "bm25");
    const idf = buildVaultRankerStats(corpus, "idf");

    const bm25Short = scoreWithVaultRanker(query, short, bm25);
    const bm25Long = scoreWithVaultRanker(query, long, bm25);
    expect(bm25Short).toBeGreaterThan(bm25Long);

    // Sanity: BM25 stats path works
    expect(bm25.mode).toBe("bm25");
    expect(bm25Score(query, short, bm25)).toBeGreaterThan(0);

    // IDF+log-TF may still favor the long doc's raw TF of "protocol"
    const idfShort = scoreWithVaultRanker(query, short, idf);
    const idfLong = scoreWithVaultRanker(query, long, idf);
    expect(idfShort).toBeGreaterThan(0);
    expect(idfLong).toBeGreaterThan(0);
  });
});
