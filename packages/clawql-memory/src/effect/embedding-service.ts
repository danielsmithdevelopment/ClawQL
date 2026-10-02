import { Context, Effect, Layer } from "effect";
import {
  effectiveVectorBackend,
  embedQueryEffect,
  embedTextsEffect,
  rankDocumentsByChunkSimilarity,
  resolveEmbeddingConfig,
  vectorBackend,
  vectorRecallEnabled,
  type ChunkWithEmbedding,
  type EmbeddingConfig,
  type VectorBackend,
} from "../embedding/embedding.js";
import { MemoryError } from "./memory-errors.js";

/** Effect service for embedding API and vector ranking helpers. */
export class EmbeddingService extends Context.Service<EmbeddingService, {
    readonly resolveEmbeddingConfig: () => EmbeddingConfig | null;
    readonly vectorBackend: () => VectorBackend;
    readonly effectiveVectorBackend: () => VectorBackend;
    readonly vectorRecallEnabled: () => boolean;
    readonly embedQuery: (
      text: string,
      config: EmbeddingConfig
    ) => Effect.Effect<Float32Array, MemoryError>;
    readonly embedTexts: (
      texts: string[],
      config: EmbeddingConfig
    ) => Effect.Effect<{ vectors: Float32Array[]; model: string; dimension: number }, MemoryError>;
    readonly rankDocumentsByChunkSimilarity: (
      query: Float32Array,
      chunks: ChunkWithEmbedding[],
      opts?: { topChunks?: number; maxDocs?: number }
    ) => { path: string; score: number; chunkId: string }[];
  }>()("clawql/EmbeddingService") {}

export const EmbeddingLive = Layer.succeed(
  EmbeddingService,
  EmbeddingService.of({
    resolveEmbeddingConfig: () => resolveEmbeddingConfig(),
    vectorBackend: () => vectorBackend(),
    effectiveVectorBackend: () => effectiveVectorBackend(),
    vectorRecallEnabled: () => vectorRecallEnabled(),
    embedQuery: (text, config) => embedQueryEffect(text, config),
    embedTexts: (texts, config) => embedTextsEffect(texts, config),
    rankDocumentsByChunkSimilarity: (query, chunks, opts) =>
      rankDocumentsByChunkSimilarity(query, chunks, opts),
  })
);

export const embeddingLiveLayer = (): Layer.Layer<EmbeddingService> => EmbeddingLive;
