/**
 * Recall vector ranking and memory.db artifact loading via Effect services.
 */

import { Effect } from "effect";
import type { RecallDbArtifacts } from "../db/memory-db.js";
import { queryPostgresVectorKnn } from "../vector/pgvector.js";
import type { MemoryDbDocument } from "./memory-db-service.js";
import { EmbeddingService } from "./embedding-service.js";
import { MemoryDbService } from "./memory-db-service.js";
import { memoryFromPromise } from "./memory-effect-utils.js";

export type RecallVectorPassInput = {
  readonly vault: string;
  readonly query: string;
  readonly mdFiles: readonly string[];
  readonly topChunks: number;
  readonly maxDocs: number;
};

export type RecallVectorPassResult = {
  readonly vectorByRel: Map<string, number>;
  readonly cuckooVectorChunksDropped?: number;
  readonly recallArtifacts: RecallDbArtifacts | null;
};

function envFlagEnabled(key: string): boolean {
  return process.env[key] === "1";
}

/** recallSyncDbEnabled document sync during vault scan. */
export function recallSyncDocumentsOnScanEffect(
  vault: string,
  docs: MemoryDbDocument[]
): Effect.Effect<void, never, MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    if (!db.recallSyncDbEnabled()) return;
    yield* db.syncMemoryDbFromDocuments(vault, docs).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory.db sync on recall failed: ${err.reason}`);
        })
      )
    );
  });
}

/** Merge wikilink edges from memory.db into recall graph seeding. */
export function recallWikilinkEdgesEffect(
  vault: string,
  documentPaths: readonly string[]
): Effect.Effect<readonly { fromPath: string; toPath: string }[], never, MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    if (!db.memoryDbSyncEnabled() || documentPaths.length === 0) {
      return [];
    }
    return yield* db.loadWikilinkEdgesFromDatabase(vault, [...documentPaths]).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory.db wikilink merge failed: ${err.reason}`);
          return [];
        })
      )
    );
  });
}

export type RecallMerkleSnapshot = {
  rootHex: string;
  leafCount: number;
  treeHeight: number;
  builtAt: string;
} | null;

/** Resolve merkle snapshot from artifacts or memory.db. */
export function recallMerkleSnapshotEffect(
  vault: string,
  recallArtifacts: RecallDbArtifacts | null
): Effect.Effect<RecallMerkleSnapshot | undefined, never, MemoryDbService> {
  return Effect.gen(function* () {
    if (!envFlagEnabled("CLAWQL_MERKLE_ENABLED")) {
      return undefined;
    }
    if (recallArtifacts != null) {
      return recallArtifacts.merkleSnapshot;
    }
    const db = yield* MemoryDbService;
    return yield* db.loadVaultMerkleSnapshotFromDb(vault).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory_recall merkle snapshot load failed: ${err.reason}`);
          return null;
        })
      )
    );
  });
}


/** Load recall artifacts (chunks, cuckoo, merkle) when memory.db sync is enabled. */
export function loadRecallArtifactsEffect(
  vault: string,
  mdFiles: readonly string[]
): Effect.Effect<RecallDbArtifacts | null, never, EmbeddingService | MemoryDbService> {
  return Effect.gen(function* () {
    const db = yield* MemoryDbService;
    const embedding = yield* EmbeddingService;
    if (!db.memoryDbSyncEnabled()) {
      return null;
    }

    const embCfg = embedding.resolveEmbeddingConfig();
    const wantChunks = Boolean(embCfg);
    const wantCuckoo = wantChunks && envFlagEnabled("CLAWQL_CUCKOO_ENABLED");
    const wantMerkle = envFlagEnabled("CLAWQL_MERKLE_ENABLED");
    if (!wantChunks && !wantMerkle) {
      return null;
    }

    return yield* db.loadRecallDbArtifacts(vault, [...mdFiles], {
      loadChunks: wantChunks,
      loadCuckoo: wantCuckoo,
      loadMerkle: wantMerkle,
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory_recall artifact load failed: ${err.reason}`);
          return null;
        })
      )
    );
  });
}

/** Hybrid vector ranking: pgvector SQL when configured, else memory.db chunk BLOB KNN. */
export function computeRecallVectorScoresEffect(
  input: RecallVectorPassInput,
  recallArtifacts: RecallDbArtifacts | null
): Effect.Effect<RecallVectorPassResult, never, EmbeddingService | MemoryDbService> {
  return Effect.gen(function* () {
    const vectorByRel = new Map<string, number>();
    const empty: RecallVectorPassResult = {
      vectorByRel,
      recallArtifacts,
    };

    const db = yield* MemoryDbService;
    const embedding = yield* EmbeddingService;
    const embCfg = embedding.resolveEmbeddingConfig();
    if (!embCfg || !db.memoryDbSyncEnabled()) {
      return empty;
    }

    const result = yield* Effect.gen(function* () {
      const cuckooPred = recallArtifacts?.cuckooPred ?? null;
      const qEmb = yield* embedding.embedQuery(input.query, embCfg);
      if (qEmb.length === 0) {
        return empty;
      }

      const rankFromMemoryDbBlobs = () => {
        const chunks = recallArtifacts?.chunks ?? [];
        if (chunks.length === 0) return [];
        return embedding.rankDocumentsByChunkSimilarity(qEmb, chunks, {
          topChunks: input.topChunks,
          maxDocs: input.maxDocs,
        });
      };

      let ranked: { path: string; score: number; chunkId: string }[] = [];
      const vb = embedding.effectiveVectorBackend();
      if (vb === "postgres") {
        ranked = yield* memoryFromPromise(() =>
          queryPostgresVectorKnn(qEmb, [...input.mdFiles], {
            topChunks: input.topChunks,
            maxDocs: input.maxDocs,
          })
        ).pipe(
          Effect.catchAll((err) =>
            Effect.sync(() => {
              console.error(
                `[clawql-mcp] memory_recall pgvector query failed, trying memory.db: ${err.reason}`
              );
              return [] as { path: string; score: number; chunkId: string }[];
            })
          )
        );
        if (ranked.length === 0) {
          ranked = rankFromMemoryDbBlobs();
        }
      } else if (vb === "sqlite") {
        ranked = rankFromMemoryDbBlobs();
      }

      let cuckooVectorChunksDropped: number | undefined;
      if (cuckooPred) {
        cuckooVectorChunksDropped = 0;
        const next: typeof ranked = [];
        for (const r of ranked) {
          if (cuckooPred(r.chunkId)) next.push(r);
          else cuckooVectorChunksDropped!++;
        }
        ranked = next;
      }

      for (const r of ranked) {
        vectorByRel.set(r.path, r.score);
      }

      return {
        vectorByRel,
        cuckooVectorChunksDropped,
        recallArtifacts,
      } satisfies RecallVectorPassResult;
    }).pipe(
      Effect.catchAll((err) =>
        Effect.sync(() => {
          console.error(`[clawql-mcp] memory_recall vector pass failed: ${err.reason}`);
          return empty;
        })
      )
    );

    return result;
  });
}

/** Load artifacts then run vector ranking when embeddings are configured. */
export function recallVectorPassEffect(
  input: RecallVectorPassInput
): Effect.Effect<RecallVectorPassResult, never, EmbeddingService | MemoryDbService> {
  return Effect.gen(function* () {
    const recallArtifacts = yield* loadRecallArtifactsEffect(input.vault, input.mdFiles);
    return yield* computeRecallVectorScoresEffect(input, recallArtifacts);
  });
}
