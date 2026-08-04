import { describe, expect, it } from "vitest";
import { buildCorpusIdf, keywordScore, tokenizeQuery } from "./recall.js";

describe("keywordScore + IDF", () => {
  it("sums capped TF without idf (legacy)", () => {
    expect(keywordScore("hello world", "Hello hello WORLD")).toBeGreaterThan(0);
  });

  it("down-weights ubiquitous terms so rare matches rank higher", () => {
    const noise = Array.from({ length: 40 }, (_, i) =>
      `Note ${i}: chainlink chainlink chainlink chainlink chainlink network feed oracle docs.`.repeat(
        4
      )
    );
    const target = "GOMAXPROCS cpu limit host core count. Also mentions chainlink once in passing.";
    const corpus = [...noise, target];
    const idf = buildCorpusIdf(corpus);
    const query = "chainlink gomaxprocs cpu";

    const noiseScore = Math.max(...noise.map((t) => keywordScore(query, t, idf)));
    const targetScore = keywordScore(query, target, idf);
    const noiseLegacy = Math.max(...noise.map((t) => keywordScore(query, t)));
    const targetLegacy = keywordScore(query, target);

    // Legacy TF: long chainlink spam beats the distinctive note.
    expect(noiseLegacy).toBeGreaterThan(targetLegacy);
    // IDF: rare gomaxprocs/cpu outweigh ubiquitous chainlink spam.
    expect(targetScore).toBeGreaterThan(noiseScore);
  });

  it("tokenizeQuery splits camelCase and punctuation", () => {
    expect(tokenizeQuery("GOMAXPROCS cpu-limit")).toEqual(
      expect.arrayContaining(["gomaxprocs", "cpu", "limit"])
    );
  });
});
