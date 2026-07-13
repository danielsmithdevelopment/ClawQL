import { Context, Effect, Layer } from "effect";
import {
  loadRecallDbArtifacts,
  loadVaultMerkleSnapshotFromDb,
  loadWikilinkEdgesFromDatabase,
  memoryDbSyncEnabled,
  recallSyncDbEnabled,
  syncMemoryDbForVaultScanRoot,
  syncMemoryDbFromDocuments,
  type RecallDbArtifacts,
} from "../db/memory-db.js";
import { MemoryError } from "./memory-errors.js";
import { memoryFromPromise } from "./memory-effect-utils.js";

export type MemoryDbDocument = { path: string; text: string; mtimeMs: number };

/** Effect service for colocated `memory.db` sync and recall artifacts. */
export class MemoryDbService extends Context.Tag("clawql/MemoryDbService")<
  MemoryDbService,
  {
    readonly memoryDbSyncEnabled: () => boolean;
    readonly recallSyncDbEnabled: () => boolean;
    readonly syncMemoryDbForVaultScanRoot: (vaultRoot: string) => Effect.Effect<void, MemoryError>;
    readonly syncMemoryDbFromDocuments: (
      vaultRoot: string,
      docs: MemoryDbDocument[]
    ) => Effect.Effect<void, MemoryError>;
    readonly loadVaultMerkleSnapshotFromDb: (
      vaultRoot: string
    ) => Effect.Effect<
      {
        rootHex: string;
        leafCount: number;
        treeHeight: number;
        builtAt: string;
      } | null,
      MemoryError
    >;
    readonly loadRecallDbArtifacts: (
      vaultRoot: string,
      documentPaths: string[],
      opts: { loadChunks: boolean; loadCuckoo: boolean; loadMerkle: boolean }
    ) => Effect.Effect<RecallDbArtifacts, MemoryError>;
    readonly loadWikilinkEdgesFromDatabase: (
      vaultRoot: string,
      documentPaths: string[]
    ) => Effect.Effect<{ fromPath: string; toPath: string }[], MemoryError>;
  }
>() {}

export const MemoryDbLive = Layer.succeed(
  MemoryDbService,
  MemoryDbService.of({
    memoryDbSyncEnabled: () => memoryDbSyncEnabled(),
    recallSyncDbEnabled: () => recallSyncDbEnabled(),
    syncMemoryDbForVaultScanRoot: (vaultRoot) =>
      memoryFromPromise(() => syncMemoryDbForVaultScanRoot(vaultRoot)),
    syncMemoryDbFromDocuments: (vaultRoot, docs) =>
      memoryFromPromise(() => syncMemoryDbFromDocuments(vaultRoot, docs)),
    loadVaultMerkleSnapshotFromDb: (vaultRoot) =>
      memoryFromPromise(() => loadVaultMerkleSnapshotFromDb(vaultRoot)),
    loadRecallDbArtifacts: (vaultRoot, documentPaths, opts) =>
      memoryFromPromise(() => loadRecallDbArtifacts(vaultRoot, documentPaths, opts)),
    loadWikilinkEdgesFromDatabase: (vaultRoot, documentPaths) =>
      memoryFromPromise(() => loadWikilinkEdgesFromDatabase(vaultRoot, documentPaths)),
  })
);

export const memoryDbLiveLayer = (): Layer.Layer<MemoryDbService> => MemoryDbLive;
