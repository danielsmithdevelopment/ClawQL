import { buildMerkleSnapshot, merkleProof, verifyMerkleProof } from "clawql-merkle";
import { Effect } from "effect";
import type { WORMEntry } from "./entry.js";

export type MerkleRoot = {
  rootHex: string;
  fromSeq: number;
  toSeq: number;
  entryCount: number;
  computedAt: string;
};

export type MerkleInclusionProof = {
  entryId: string;
  entryHash: string;
  rootHex: string;
  leafIndex: number;
  leafCount: number;
  siblingsHex: string[];
  valid: boolean;
};

function rows(entries: WORMEntry[]) {
  return [...entries]
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      path: String(e.seq).padStart(12, "0"),
      bodySha256Hex: e.hash,
    }));
}

export class MerkleBatchLayer {
  buildRoot(entries: WORMEntry[]): Effect.Effect<MerkleRoot> {
    return Effect.sync(() => {
      const sorted = [...entries].sort((a, b) => a.seq - b.seq);
      const r = rows(sorted);
      const snapshot = buildMerkleSnapshot(r);
      return {
        rootHex: snapshot.rootHex,
        fromSeq: sorted[0]?.seq ?? -1,
        toSeq: sorted.at(-1)?.seq ?? -1,
        entryCount: r.length,
        computedAt: new Date().toISOString(),
      };
    });
  }

  prove(entry: WORMEntry, batchEntries: WORMEntry[]): Effect.Effect<MerkleInclusionProof> {
    return Effect.sync(() => {
      const r = rows(batchEntries);
      const snapshot = buildMerkleSnapshot(r);
      const leafIndex = r.findIndex((row) => row.path === String(entry.seq).padStart(12, "0"));
      if (leafIndex < 0) {
        throw new Error(`Entry ${entry.id} not in batch`);
      }
      const proof = merkleProof(snapshot, leafIndex);
      const valid = verifyMerkleProof(
        snapshot.leaves[leafIndex]!,
        leafIndex,
        snapshot.leafCount,
        proof,
        snapshot.rootHex
      );
      return {
        entryId: entry.id,
        entryHash: entry.hash,
        rootHex: snapshot.rootHex,
        leafIndex,
        leafCount: snapshot.leafCount,
        siblingsHex: proof.map((b) => b.toString("hex")),
        valid,
      };
    });
  }
}
