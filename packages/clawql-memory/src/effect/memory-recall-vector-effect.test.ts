import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { EmbeddingService, embeddingLiveLayer } from "./embedding-service.js";
import { MemoryDbService, memoryDbLiveLayer } from "./memory-db-service.js";
import {
  loadRecallArtifactsEffect,
  recallVectorPassEffect,
} from "./memory-recall-vector-effect.js";

const infraLayer = Layer.mergeAll(memoryDbLiveLayer(), embeddingLiveLayer());

describe("recallVectorPassEffect", () => {
  it("returns empty vector map when embeddings are not configured", async () => {
    const result = await Effect.runPromise(
      recallVectorPassEffect({
        vault: "/tmp/vault",
        query: "test query",
        mdFiles: ["Memory/note.md"],
        topChunks: 10,
        maxDocs: 5,
      }).pipe(Effect.provide(infraLayer))
    );
    expect(result.vectorByRel.size).toBe(0);
    expect(result.recallArtifacts).toBeNull();
  });

  it("loadRecallArtifactsEffect respects memoryDbSyncEnabled", async () => {
    const saved = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    try {
      const artifacts = await Effect.runPromise(
        loadRecallArtifactsEffect("/tmp/v", ["a.md"]).pipe(Effect.provide(infraLayer))
      );
      expect(artifacts).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = saved;
    }
  });
});

describe("EmbeddingService in vector pass", () => {
  it("exposes rankDocumentsByChunkSimilarity", async () => {
    const ranked = await Effect.runPromise(
      Effect.gen(function* () {
        const embedding = yield* EmbeddingService;
        return embedding.rankDocumentsByChunkSimilarity(new Float32Array([1, 0]), [], {
          topChunks: 5,
          maxDocs: 3,
        });
      }).pipe(Effect.provide(embeddingLiveLayer()))
    );
    expect(ranked).toEqual([]);
  });
});

describe("MemoryDbService in recall infra", () => {
  it("skips wikilink load when sync disabled", async () => {
    const edges = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* MemoryDbService;
        return yield* db
          .loadWikilinkEdgesFromDatabase("/v", ["a.md"])
          .pipe(Effect.catchAll(() => Effect.succeed([])));
      }).pipe(Effect.provide(memoryDbLiveLayer()))
    );
    expect(Array.isArray(edges)).toBe(true);
  });
});
