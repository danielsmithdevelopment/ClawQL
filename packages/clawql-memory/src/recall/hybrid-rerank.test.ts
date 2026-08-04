import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, rerankNormalizedHitsRrf } from "./hybrid-rerank.js";
import type { NormalizedRecallHit } from "./recall-sources.js";

function hit(
  source: NormalizedRecallHit["source"],
  id: string,
  score: number,
  path?: string
): NormalizedRecallHit {
  return { source, id, score, snippet: id, path: path ?? id };
}

describe("reciprocalRankFusion", () => {
  it("prefers items ranked high in multiple lists", () => {
    const vault = [hit("vault", "b", 10), hit("vault", "a", 5), hit("vault", "c", 1)];
    const vector = [hit("vector", "b", 0.9), hit("vector", "a", 0.5), hit("vector", "d", 0.4)];
    const fused = reciprocalRankFusion([vault, vector], { k: 60, limit: 4 });
    expect(fused[0]?.id).toBe("b"); // #1 in both lists
    expect(fused.map((h) => h.id)).toContain("a");
  });
});

describe("rerankNormalizedHitsRrf", () => {
  it("partitions by source then fuses", () => {
    const hits = [
      hit("vault", "x", 100),
      hit("onyx", "y", 0.1),
      hit("vault", "z", 50),
      hit("onyx", "x", 0.99),
    ];
    const fused = rerankNormalizedHitsRrf(hits, { limit: 3 });
    expect(fused[0]?.id).toBe("x"); // appears in vault + onyx
    expect(fused[0]?.meta?.rrf).toBeGreaterThan(0);
  });
});
