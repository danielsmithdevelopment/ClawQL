import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { createEmbedder, resolveInferenceEmbeddingConfig, type Embedder } from "./embedding.js";
import { createSemanticCacheEntry, InMemorySemanticCacheStore } from "./in-memory.js";
import { buildCacheSignatureText, hashSystemPrompt } from "./signature.js";
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
    if (!this.config.enabled) {
      return this.inner.complete(request);
    }

    const modelId = request.model ?? request.routing?.modelId;
    if (!modelId) {
      return this.inner.complete(request);
    }

    const signatureText = buildCacheSignatureText(request.messages);
    let embedding: Float32Array;
    try {
      embedding = await this.embedder.embed(signatureText);
    } catch {
      return this.inner.complete(request);
    }
    if (!embedding.length) {
      return this.inner.complete(request);
    }

    const hit = this.cacheStore.lookup({
      modelId,
      embedding,
      threshold: this.config.threshold,
    });
    if (hit) {
      return {
        ...hit.entry.response,
        model: hit.entry.response.model || modelId,
        cacheHit: true,
        routing: request.routing ?? hit.entry.response.routing,
        correlationId: request.correlationId ?? hit.entry.response.correlationId,
      };
    }

    const response = await this.inner.complete(request);
    this.cacheStore.put(
      createSemanticCacheEntry({
        modelId,
        signatureText,
        systemPromptHash: hashSystemPrompt(request.messages),
        embedding,
        response: { ...response, cacheHit: false },
        ttlMs: this.config.ttlMs,
      })
    );
    return response;
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
