/**
 * Audit V1: when home-sync pull honors a shared erasure tombstone, delete the
 * note file is not enough — purge local memory.db / pgvector / ontology rows.
 */

import { Effect } from "effect";
import { deleteDocumentFromMemoryDb } from "../db/memory-db.js";
import { deleteOntologyRowsByVaultNotePath } from "../ontology/ontology-erase.js";
import { deletePostgresChunkVectorsByPaths } from "../vector/pgvector.js";

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}

export type PurgeDerivedStoresResult = {
  memoryDb: boolean;
  pgvector: boolean;
  ontology: boolean;
};

export function purgeDerivedStoresForVaultPathEffect(
  vaultRoot: string,
  relativePath: string
): Effect.Effect<PurgeDerivedStoresResult> {
  return Effect.gen(function* () {
    const rel = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");

    const memExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => deleteDocumentFromMemoryDb(vaultRoot, rel),
        catch: asError,
      })
    );
    const vecExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => deletePostgresChunkVectorsByPaths([rel]),
        catch: asError,
      })
    );
    const ontExit = yield* Effect.exit(
      Effect.tryPromise({
        try: () => deleteOntologyRowsByVaultNotePath(vaultRoot, rel),
        catch: asError,
      })
    );

    return {
      memoryDb: memExit._tag === "Success",
      pgvector: vecExit._tag === "Success",
      ontology: ontExit._tag === "Success",
    };
  });
}

export async function purgeDerivedStoresForVaultPath(
  vaultRoot: string,
  relativePath: string
): Promise<PurgeDerivedStoresResult> {
  return Effect.runPromise(purgeDerivedStoresForVaultPathEffect(vaultRoot, relativePath));
}
