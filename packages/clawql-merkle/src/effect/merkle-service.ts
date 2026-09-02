import { Context, Effect, Layer } from "effect";
import {
  buildMerkleSnapshot,
  leafHash,
  merkleProof,
  nodeHash,
  verifyMerkleProof,
  type MerkleDocumentRow,
  type MerkleSnapshot,
} from "../merkle-tree.js";

export class MerkleService extends Context.Tag("clawql/MerkleService")<
  MerkleService,
  {
    readonly buildSnapshot: (rows: readonly MerkleDocumentRow[]) => Effect.Effect<MerkleSnapshot>;
    readonly leafHash: (path: string, bodySha256Hex: string) => Effect.Effect<Buffer>;
    readonly nodeHash: (left: Buffer, right: Buffer) => Effect.Effect<Buffer>;
    readonly merkleProof: (
      snapshot: MerkleSnapshot,
      leafIndex: number
    ) => Effect.Effect<readonly Buffer[]>;
    readonly verifyProof: (
      snapshot: MerkleSnapshot,
      leafIndex: number,
      proof: readonly Buffer[]
    ) => Effect.Effect<boolean>;
  }
>() {}

export const MerkleServiceLive = Layer.succeed(
  MerkleService,
  MerkleService.of({
    buildSnapshot: (rows) => Effect.sync(() => buildMerkleSnapshot([...rows])),
    leafHash: (path, bodySha256Hex) => Effect.sync(() => leafHash(path, bodySha256Hex)),
    nodeHash: (left, right) => Effect.sync(() => nodeHash(left, right)),
    merkleProof: (snapshot, leafIndex) => Effect.sync(() => merkleProof(snapshot, leafIndex)),
    verifyProof: (snapshot, leafIndex, proof) =>
      Effect.sync(() =>
        verifyMerkleProof(
          snapshot.leaves[leafIndex]!,
          leafIndex,
          snapshot.leafCount,
          proof,
          snapshot.rootHex
        )
      ),
  })
);

export function runMerkleEffect<A, E>(program: Effect.Effect<A, E, MerkleService>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(MerkleServiceLive)));
}
