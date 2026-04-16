import { describe, expect, it } from "vitest";
import {
  blobToFloat32Array,
  cosineSimilarity,
  float32ArrayToBlob,
  rankDocumentsByChunkSimilarity,
} from "./memory-embedding.js";

describe("memory-embedding", () => {
  it("cosineSimilarity is 1 for identical unit vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it("cosineSimilarity is 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("roundtrips float32 through blob helpers", () => {
    const v = new Float32Array([0.25, -0.5, 1]);
    const blob = float32ArrayToBlob(v);
    const back = blobToFloat32Array(blob);
    expect(back.length).toBe(3);
    expect(back[0]).toBeCloseTo(0.25);
    expect(back[1]).toBeCloseTo(-0.5);
    expect(back[2]).toBeCloseTo(1);
  });

  it("rankDocumentsByChunkSimilarity picks best path per chunk scores", () => {
    const q = new Float32Array([1, 0, 0]);
    const chunks = [
      {
        documentPath: "a.md",
        chunkId: "c1",
        text: "x",
        embedding: new Float32Array([1, 0, 0]),
      },
      {
        documentPath: "a.md",
        chunkId: "c2",
        text: "y",
        embedding: new Float32Array([0, 1, 0]),
      },
      {
        documentPath: "b.md",
        chunkId: "c3",
        text: "z",
        embedding: new Float32Array([0.9, 0.1, 0]),
      },
    ];
    const ranked = rankDocumentsByChunkSimilarity(q, chunks, { topChunks: 10, maxDocs: 5 });
    expect(ranked[0]!.path).toBe("a.md");
    expect(ranked[0]!.score).toBeCloseTo(1, 5);
    expect(ranked.some((r) => r.path === "b.md")).toBe(true);
  });
});
