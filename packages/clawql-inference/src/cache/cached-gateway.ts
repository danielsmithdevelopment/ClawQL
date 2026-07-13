import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { createEmbedder, resolveInferenceEmbeddingConfig, type Embedder } from "./embedding.js";
import { InMemorySemanticCacheStore } from "./in-memory.js";
import {
  completeWithSemanticCacheProgram,
  runSemanticCacheEffect,
} from "./effect/semantic-cache-layer.js";
import {
  loadSemanticCacheConfig,
  type SemanticCacheConfig,
  type SemanticCacheStore,
} from "./types.js";

export class SemanticCachedGateway implements InferenceGateway {
  readonly cacheStore: SemanticCacheStore;

  constructor(
    private readonly inner: InferenceGateway,
    cache: SemanticCacheStore,
    private readonly config: SemanticCacheConfig,
    private readonly embedder: Embedder
  ) {
    this.cacheStore = cache;
  }

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    return runSemanticCacheEffect(
      completeWithSemanticCacheProgram(request),
      this.inner,
      this.config,
      this.cacheStore,
      this.embedder
    );
  }
}

export type WithSemanticCacheOptions = {
  env?: NodeJS.ProcessEnv;
  config?: SemanticCacheConfig;
  cache?: SemanticCacheStore;
  embedder?: Embedder;
};

export function createSemanticCacheStore(config: SemanticCacheConfig): InMemorySemanticCacheStore {
  return new InMemorySemanticCacheStore({
    enabled: config.enabled,
    threshold: config.threshold,
    ttlMs: config.ttlMs,
    maxEntries: config.maxEntries,
  });
}

export function withSemanticCache(
  gateway: InferenceGateway,
  options: WithSemanticCacheOptions = {}
): InferenceGateway {
  const env = options.env ?? process.env;
  const config = options.config ?? loadSemanticCacheConfig(env);
  if (!config.enabled) return gateway;

  const embeddingConfig = resolveInferenceEmbeddingConfig(env);
  if (!embeddingConfig && !options.embedder) return gateway;

  const embedder = options.embedder ?? createEmbedder(embeddingConfig!);
  const cache = options.cache ?? createSemanticCacheStore(config);
  return new SemanticCachedGateway(gateway, cache, config, embedder);
}

export function isSemanticCachedGateway(
  gateway: InferenceGateway
): gateway is SemanticCachedGateway {
  return gateway instanceof SemanticCachedGateway;
}
