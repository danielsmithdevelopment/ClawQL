import { describe, expect, it } from "vitest";
import {
  buildMerkleSnapshot,
  leafHash,
  merkleProof,
  verifyMerkleProof,
} from "./merkle-tree.js";

describe("merkle-tree", () => {
  it("empty snapshot uses deterministic empty root", () => {
    const s = buildMerkleSnapshot([]);
    expect(s.leafCount).toBe(0);
    expect(s.leaves).toHaveLength(0);
    expect(verifyMerkleProof(Buffer.alloc(32), 0, 0, [], s.rootHex)).toBe(true);
  });

  it("proof verifies for each leaf", () => {
    const rows = [
      { path: "b.md", bodySha256Hex: "bb".repeat(32) },
      { path: "a.md", bodySha256Hex: "aa".repeat(32) },
    ];
    const snap = buildMerkleSnapshot(rows);
    expect(snap.leafCount).toBe(2);
    for (let i = 0; i < snap.leaves.length; i++) {
      const proof = merkleProof(snap, i);
      expect(
        verifyMerkleProof(snap.leaves[i]!, i, snap.leafCount, proof, snap.rootHex)
      ).toBe(true);
    }
  });

  it("rejects tampered root", () => {
    const snap = buildMerkleSnapshot([{ path: "x.md", bodySha256Hex: "01".repeat(32) }]);
    const proof = merkleProof(snap, 0);
    expect(verifyMerkleProof(snap.leaves[0]!, 0, 1, proof, "00".repeat(32))).toBe(false);
  });

  it("leafHash differs when body changes", () => {
    const a = leafHash("p.md", "01".repeat(32));
    const b = leafHash("p.md", "02".repeat(32));
    expect(a.equals(b)).toBe(false);
  });
});
