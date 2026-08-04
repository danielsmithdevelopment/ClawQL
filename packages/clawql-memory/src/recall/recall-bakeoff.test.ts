/**
 * Regression for the measured 116-note bakeoff failure mode:
 * raw keyword-count ranking loses on shared-vocabulary corpora;
 * IDF recovers rare-token targets; vector similarity recovers paraphrases.
 */
import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankDocumentsByChunkSimilarity } from "../embedding/embedding.js";
import { buildCorpusIdf, keywordScore, tokenizeQuery } from "./recall.js";

function grepCountScore(query: string, text: string): number {
  const terms = tokenizeQuery(query);
  const hay = text.toLowerCase();
  let score = 0;
  for (const t of terms) {
    let i = 0;
    while ((i = hay.indexOf(t, i)) !== -1) {
      score += 1;
      i += t.length;
    }
  }
  return score;
}

/** Tiny bag-of-concepts embedder with synonym expansion (stands in for MiniLM). */
function bagEmbed(text: string, concepts: readonly string[]): Float32Array {
  const lower = text.toLowerCase();
  const expanded = lower
    .replace(/\bsticky server affinity\b/g, "session")
    .replace(/\bcredential mechanism\b/g, "jwt")
    .replace(/\bavoids sticky\b/g, "jwt")
    .replace(/\bbearer\b/g, "jwt")
    .replace(/\bapi auth\b/g, "jwt")
    .replace(/\bjwt\b/g, "jwt");
  return Float32Array.from(concepts.map((c) => (expanded.includes(c) ? 1 : 0)));
}

describe("recall bakeoff regressions (grep vs IDF vs vector)", () => {
  it("IDF beats raw keyword-count / grep on TF-spam corpora", () => {
    // Same failure mode as keyword-idf.test.ts + measured bakeoff:
    // ubiquitous shared tokens inflate greppy TF; rare tokens need IDF.
    const noise = Array.from({ length: 40 }, (_, i) =>
      `Note ${i}: chainlink chainlink chainlink chainlink chainlink network feed oracle docs.`.repeat(
        4
      )
    );
    const target = "GOMAXPROCS cpu limit host core count. Also mentions chainlink once in passing.";
    const corpus = [...noise, target];
    const idf = buildCorpusIdf(corpus);
    const query = "chainlink gomaxprocs cpu";

    const grepWinner = corpus
      .map((t, i) => ({ i, score: grepCountScore(query, t) }))
      .sort((a, b) => b.score - a.score)[0]!;
    const idfWinner = corpus
      .map((t, i) => ({ i, score: keywordScore(query, t, idf) }))
      .sort((a, b) => b.score - a.score)[0]!;

    const targetIdx = corpus.length - 1;
    expect(grepWinner.i).not.toBe(targetIdx);
    expect(idfWinner.i).toBe(targetIdx);
  });

  it("vector similarity recovers paraphrase queries that keyword-count misses", () => {
    const concepts = ["jwt", "session", "argon2", "gomaxprocs", "tailscale"] as const;

    const docs = [
      {
        path: "Memory/auth-jwt.md",
        text: "Decision: use JWT bearer tokens for API auth (no shared session store).",
      },
      {
        path: "Memory/password-hash.md",
        text: "Decision: argon2id over bcrypt after latency benchmarks.",
      },
      {
        path: "Memory/gomaxprocs.md",
        text: "Pin GOMAXPROCS to host core count for Go services.",
      },
      ...Array.from({ length: 40 }, (_, i) => ({
        path: `Memory/noise-${i}.md`,
        text: `Generic agent memory vault note ${i} about patterns and runbooks.`,
      })),
    ];

    // Zero lexical overlap with the JWT note (substring-safe: avoid short tokens like "or").
    const query = "credential mechanism that avoids sticky server affinity";
    expect(grepCountScore(query, docs[0]!.text)).toBe(0);

    const chunks = docs.map((d, i) => ({
      documentPath: d.path,
      chunkId: `c${i}`,
      embedding: bagEmbed(d.text, concepts),
    }));
    const qEmb = bagEmbed(query, concepts);
    expect(cosineSimilarity(qEmb, bagEmbed(docs[0]!.text, concepts))).toBeGreaterThan(0.4);

    const vectorRanked = rankDocumentsByChunkSimilarity(qEmb, chunks, {
      topChunks: 20,
      maxDocs: 5,
    });
    expect(vectorRanked[0]?.path).toBe("Memory/auth-jwt.md");
  });

  it("IDF ranks distinctive ontology note above shared-vocabulary noise", () => {
    const noise = Array.from({ length: 50 }, (_, i) => ({
      path: `Memory/noise-${i}.md`,
      text: `Note ${i}: vault memory agent decision context session pattern. `.repeat(8),
    }));
    const target = {
      path: "Memory/ontology-kinetic.md",
      text: "Enterprise ontology kinetic writes require ATR mandates before mutating Contract status.",
    };
    const docs = [...noise, target];
    const idf = buildCorpusIdf(docs.map((d) => d.text));
    const query = "ontology kinetic atr contract mutation";

    const idfTop = docs
      .map((d) => ({ path: d.path, score: keywordScore(query, d.text, idf) }))
      .sort((a, b) => b.score - a.score)[0]!;

    expect(idfTop.path).toBe(target.path);
    expect(idfTop.score).toBeGreaterThan(0);
  });
});
