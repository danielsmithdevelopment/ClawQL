/**
 * Batch Merkle roots over proposal digests (ADR 0015).
 *
 * One security-key touch signs the root of N digests; each consume proves
 * inclusion under that root. Batches are not atomic — see program-submit.
 */

import { createHash } from "node:crypto";
import { Context, Effect, Layer } from "effect";

export type MerkleInclusionProof = {
  readonly root: string;
  readonly index: number;
  readonly leafCount: number;
  /** Sibling hashes from leaf toward root (hex). Empty when leafCount === 1. */
  readonly proof: readonly string[];
};

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Domain-separated leaf: H("clawql-batch-leaf" || digest). */
export function digestLeaf(argsDigest: string): string {
  return sha256Hex(`clawql-batch-leaf:${argsDigest}`);
}

function pairHash(left: string, right: string): string {
  return sha256Hex(`clawql-batch-node:${left}:${right}`);
}

/**
 * Binary Merkle root over digests (order-preserving). Odd nodes duplicate the
 * last leaf at each level (Bitcoin-style), so proofs are deterministic.
 */
export function merkleRoot(digests: readonly string[]): string {
  if (digests.length === 0) {
    return sha256Hex("clawql-batch-empty");
  }
  let level = digests.map((d) => digestLeaf(d));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(pairHash(left, right));
    }
    level = next;
  }
  return level[0]!;
}

export function inclusionProof(digests: readonly string[], index: number): MerkleInclusionProof {
  if (digests.length === 0) {
    throw new Error("inclusionProof: empty digest set");
  }
  if (!Number.isInteger(index) || index < 0 || index >= digests.length) {
    throw new Error(`inclusionProof: index ${index} out of range 0..${digests.length - 1}`);
  }
  let level = digests.map((d) => digestLeaf(d));
  let idx = index;
  const proof: string[] = [];
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = level[siblingIdx] ?? level[idx]!;
    proof.push(sibling);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      next.push(pairHash(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return {
    root: level[0]!,
    index,
    leafCount: digests.length,
    proof,
  };
}

export function verifyInclusion(argsDigest: string, proof: MerkleInclusionProof): boolean {
  let hash = digestLeaf(argsDigest);
  let idx = proof.index;
  for (const sibling of proof.proof) {
    const isRight = idx % 2 === 1;
    hash = isRight ? pairHash(sibling, hash) : pairHash(hash, sibling);
    idx = Math.floor(idx / 2);
  }
  return hash === proof.root;
}

/** Build root + per-leaf proofs for a proposal batch (hex digests). */
export function buildBatchMerkle(digests: readonly string[]): {
  readonly root: string;
  readonly leaves: readonly {
    readonly digest: string;
    readonly index: number;
    readonly proof: MerkleInclusionProof;
  }[];
} {
  const root = merkleRoot(digests);
  return {
    root,
    leaves: digests.map((digest, index) => ({
      digest,
      index,
      proof: inclusionProof(digests, index),
    })),
  };
}

export function merkleRootEffect(digests: readonly string[]): Effect.Effect<string> {
  return Effect.sync(() => merkleRoot(digests));
}

export function buildBatchMerkleEffect(
  digests: readonly string[]
): Effect.Effect<ReturnType<typeof buildBatchMerkle>> {
  return Effect.sync(() => buildBatchMerkle(digests));
}

export class BatchMerkleService extends Context.Service<
  BatchMerkleService,
  {
    readonly root: (digests: readonly string[]) => Effect.Effect<string>;
    readonly build: (
      digests: readonly string[]
    ) => Effect.Effect<ReturnType<typeof buildBatchMerkle>>;
    readonly verify: (argsDigest: string, proof: MerkleInclusionProof) => Effect.Effect<boolean>;
  }
>()("clawql/BatchMerkleService") {}

export const BatchMerkleLive = Layer.succeed(
  BatchMerkleService,
  BatchMerkleService.of({
    root: merkleRootEffect,
    build: buildBatchMerkleEffect,
    verify: (d, p) => Effect.sync(() => verifyInclusion(d, p)),
  })
);
