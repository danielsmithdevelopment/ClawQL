import {
  buildMerkleSnapshot,
  leafHash,
  merkleProof,
  verifyMerkleProof,
} from "clawql-merkle";
import { Effect } from "effect";
import type { WORMEntry } from "./entry.js";
import { AuditError } from "./errors.js";

export type MerkleRoot = {
  rootHex: string;
  fromChainIndex: number;
  toChainIndex: number;
  entryCount: number;
  computedAt: string;
};

export type MerkleInclusionProof = {
  entryId: string;
  entryHash: string;
  chainIndex: number;
  rootHex: string;
  /** Hex-encoded sibling hashes leaf→root. */
  siblings: string[];
  leafIndex: number;
  leafCount: number;
  valid: boolean;
};

function leavesFromEntries(entries: readonly WORMEntry[]) {
  return entries.map((e) => ({
    path: String(e.chainIndex).padStart(12, "0"),
    bodySha256Hex: e.hash,
  }));
}

export class MerkleBatchLayer {
  buildRoot(entries: readonly WORMEntry[]): Effect.Effect<MerkleRoot, AuditError> {
    return Effect.gen(function* () {
      if (entries.length === 0) {
        return yield* Effect.fail(
          new AuditError({ reason: "Cannot build Merkle root over empty batch" })
        );
      }
      const sorted = [...entries].sort((a, b) => a.chainIndex - b.chainIndex);
      const { rootHex } = buildMerkleSnapshot(leavesFromEntries(sorted));
      return {
        rootHex,
        fromChainIndex: sorted[0]!.chainIndex,
        toChainIndex: sorted[sorted.length - 1]!.chainIndex,
        entryCount: sorted.length,
        computedAt: new Date().toISOString(),
      };
    });
  }

  prove(
    entry: WORMEntry,
    batchEntries: readonly WORMEntry[]
  ): Effect.Effect<MerkleInclusionProof, AuditError> {
    return Effect.gen(function* () {
      const sorted = [...batchEntries].sort((a, b) => a.chainIndex - b.chainIndex);
      const leafIndex = sorted.findIndex((e) => e.id === entry.id);
      if (leafIndex === -1) {
        return yield* Effect.fail(
          new AuditError({ reason: `Entry ${entry.id} not found in batch` })
        );
      }
      const snap = buildMerkleSnapshot(leavesFromEntries(sorted));
      const siblings = merkleProof(snap, leafIndex).map((b) => b.toString("hex"));
      return {
        entryId: entry.id,
        entryHash: entry.hash,
        chainIndex: entry.chainIndex,
        rootHex: snap.rootHex,
        siblings,
        leafIndex,
        leafCount: snap.leafCount,
        valid: true,
      };
    });
  }

  verify(proof: MerkleInclusionProof): Effect.Effect<boolean> {
    return Effect.sync(() => {
      const leaf = leafHash(
        String(proof.chainIndex).padStart(12, "0"),
        proof.entryHash
      );
      const siblings = proof.siblings.map((h) => Buffer.from(h, "hex"));
      return verifyMerkleProof(
        leaf,
        proof.leafIndex,
        proof.leafCount,
        siblings,
        proof.rootHex
      );
    });
  }
}
