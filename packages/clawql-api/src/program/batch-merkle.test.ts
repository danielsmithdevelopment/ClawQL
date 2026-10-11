import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  BatchMerkleLive,
  BatchMerkleService,
  buildBatchMerkle,
  digestLeaf,
  inclusionProof,
  merkleRoot,
  verifyInclusion,
} from "./batch-merkle.js";

describe("batch-merkle (ADR 0015)", () => {
  it("empty set has a stable empty root", () => {
    expect(merkleRoot([])).toMatch(/^[0-9a-f]{64}$/);
    expect(merkleRoot([])).toBe(merkleRoot([]));
  });

  it("single digest: root equals leaf hash; empty proof verifies", () => {
    const digests = ["aaa"];
    const root = merkleRoot(digests);
    expect(root).toBe(digestLeaf("aaa"));
    const proof = inclusionProof(digests, 0);
    expect(proof.root).toBe(root);
    expect(proof.proof).toEqual([]);
    expect(verifyInclusion("aaa", proof)).toBe(true);
    expect(verifyInclusion("bbb", proof)).toBe(false);
  });

  it("odd leaf counts duplicate the last leaf at each level", () => {
    const digests = ["a", "b", "c"];
    const batch = buildBatchMerkle(digests);
    expect(batch.root).toMatch(/^[0-9a-f]{64}$/);
    for (const leaf of batch.leaves) {
      expect(verifyInclusion(leaf.digest, leaf.proof)).toBe(true);
      expect(leaf.proof.root).toBe(batch.root);
    }
    expect(verifyInclusion("a", batch.leaves[1]!.proof)).toBe(false);
  });

  it("order matters for the root", () => {
    expect(merkleRoot(["x", "y"])).not.toBe(merkleRoot(["y", "x"]));
  });

  it("BatchMerkleService layer matches pure helpers", async () => {
    const digests = ["d1", "d2", "d3", "d4"];
    const out = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* BatchMerkleService;
        const root = yield* svc.root(digests);
        const batch = yield* svc.build(digests);
        const ok = yield* svc.verify(digests[2]!, batch.leaves[2]!.proof);
        return { root, batch, ok };
      }).pipe(Effect.provide(BatchMerkleLive))
    );
    expect(out.root).toBe(merkleRoot(digests));
    expect(out.batch.root).toBe(out.root);
    expect(out.ok).toBe(true);
  });

  it("inclusionProof rejects bad index", () => {
    expect(() => inclusionProof(["a"], 1)).toThrow(/out of range/);
    expect(() => inclusionProof([], 0)).toThrow(/empty/);
  });
});
