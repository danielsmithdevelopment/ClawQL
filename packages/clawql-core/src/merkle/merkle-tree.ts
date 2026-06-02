/**
 * Binary Merkle tree over vault document rows (path + body SHA-256) for integrity snapshots
 * and membership proofs (issue #37). Leaf order is lexicographic by `path`.
 */

import { createHash } from "node:crypto";

const LEAF_PREFIX = Buffer.from("clawql:merkle:leaf:v1\0", "utf8");
const NODE_PREFIX = Buffer.from("clawql:merkle:node:v1\0", "utf8");
const EMPTY_ROOT = createHash("sha256").update("clawql:merkle:empty:v1", "utf8").digest();

export function leafHash(path: string, bodySha256Hex: string): Buffer {
  return createHash("sha256")
    .update(LEAF_PREFIX)
    .update(path, "utf8")
    .update("\0", "utf8")
    .update(bodySha256Hex, "utf8")
    .digest();
}

export function nodeHash(left: Buffer, right: Buffer): Buffer {
  return createHash("sha256").update(NODE_PREFIX).update(left).update(right).digest();
}

export type MerkleDocumentRow = { path: string; bodySha256Hex: string };

export type MerkleSnapshot = {
  rootHex: string;
  leafCount: number;
  treeHeight: number;
  /** Sorted copy of leaf hashes (for proof indices). */
  leaves: Buffer[];
};

function nextTreeLevel(level: Buffer[]): Buffer[] {
  const next: Buffer[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const L = level[i]!;
    const R = i + 1 < level.length ? level[i + 1]! : L;
    next.push(nodeHash(L, R));
  }
  return next;
}

function siblingIndex(idx: number, len: number): number {
  if (idx % 2 === 0) {
    return idx + 1 < len ? idx + 1 : idx;
  }
  return idx - 1;
}

/**
 * Build a Merkle tree from document rows. Paths are sorted lexicographically.
 * Odd levels duplicate the last hash (common minimal pattern).
 */
export function buildMerkleSnapshot(rows: MerkleDocumentRow[]): MerkleSnapshot {
  const sorted = [...rows].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const leaves = sorted.map((r) => leafHash(r.path, r.bodySha256Hex));
  if (leaves.length === 0) {
    return {
      rootHex: EMPTY_ROOT.toString("hex"),
      leafCount: 0,
      treeHeight: 0,
      leaves: [],
    };
  }
  let level: Buffer[] = leaves;
  let height = 0;
  while (level.length > 1) {
    level = nextTreeLevel(level);
    height++;
  }
  const root = level[0]!;
  return {
    rootHex: root.toString("hex"),
    leafCount: leaves.length,
    treeHeight: height,
    leaves,
  };
}

/** Sibling digests from leaf to root (same pairing as `buildMerkleSnapshot`). */
export function merkleProof(snapshot: Pick<MerkleSnapshot, "leaves">, leafIndex: number): Buffer[] {
  const leaves = snapshot.leaves;
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("merkleProof: leafIndex out of range");
  }
  if (leaves.length === 0) return [];
  let level = [...leaves];
  let idx = leafIndex;
  const proof: Buffer[] = [];
  while (level.length > 1) {
    const len = level.length;
    const sib = siblingIndex(idx, len);
    proof.push(Buffer.from(level[sib]!));
    level = nextTreeLevel(level);
    idx = (idx / 2) | 0;
  }
  return proof;
}

export function verifyMerkleProof(
  leafLeafHash: Buffer,
  leafIndex: number,
  leafCount: number,
  proof: readonly Buffer[],
  expectedRootHex: string
): boolean {
  if (leafCount === 0) {
    return EMPTY_ROOT.toString("hex") === expectedRootHex;
  }
  let idx = leafIndex;
  let acc = leafLeafHash;
  for (const sibling of proof) {
    if (idx % 2 === 0) {
      acc = nodeHash(acc, sibling);
    } else {
      acc = nodeHash(sibling, acc);
    }
    idx = (idx / 2) | 0;
  }
  return acc.toString("hex") === expectedRootHex;
}
