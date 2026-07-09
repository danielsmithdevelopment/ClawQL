import { buildMerkleSnapshot, leafHash, type MerkleDocumentRow } from "clawql-core";

export type MerkleLeafInput = { id: string; sha256: string };

export function merkleRootFromLeaves(leaves: MerkleLeafInput[]): {
  merkleRoot: string;
  leafCount: number;
} {
  const rows: MerkleDocumentRow[] = leaves.map((l) => ({
    path: `release/${l.id}`,
    bodySha256Hex: l.sha256.replace(/^sha256:/i, ""),
  }));
  const snap = buildMerkleSnapshot(rows);
  return { merkleRoot: snap.rootHex, leafCount: snap.leafCount };
}

export function leafHashForReleaseArtifact(id: string, sha256: string): string {
  return leafHash(id.startsWith("release/") ? id : `release/${id}`, sha256.replace(/^sha256:/i, "")).toString(
    "hex"
  );
}
