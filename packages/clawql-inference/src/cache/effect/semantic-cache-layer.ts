import { Cause, Effect, Exit, Layer } from "effect";
import type { Embedder } from "../embedding.js";
import type { SemanticCacheConfig, SemanticCacheStore } from "../types.js";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import { inferenceGatewayLiveLayer } from "../../fallback/effect/inference-gateway-service.js";
import { embedderLiveLayer } from "./embedder-service.js";
import { SemanticCacheService, semanticCacheLiveLayer } from "./semantic-cache-service.js";
import { semanticCacheStoreLiveLayer } from "./semantic-cache-store-service.js";

export type SemanticCacheServices = SemanticCacheService;

export function makeSemanticCacheLayer(
  inner: InferenceGateway,
  config: SemanticCacheConfig,
  cache: SemanticCacheStore,
  embedder: Embedder
): Layer.Layer<SemanticCacheService> {
  return semanticCacheLiveLayer(config).pipe(
    Layer.provide(
      Layer.mergeAll(
        inferenceGatewayLiveLayer(inner),
        embedderLiveLayer(embedder),
        semanticCacheStoreLiveLayer(cache)
      )
    )
  );
}

/** Run a semantic cache Effect program with gateway + store + embedder layers. */
export async function runSemanticCacheEffect<A>(
  program: Effect.Effect<A, unknown, SemanticCacheServices>,
  inner: InferenceGateway,
  config: SemanticCacheConfig,
  cache: SemanticCacheStore,
  embedder: Embedder
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(makeSemanticCacheLayer(inner, config, cache, embedder)))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** Complete with semantic cache via Effect services (used by {@link SemanticCachedGateway}). */
export function completeWithSemanticCacheProgram(
  request: InferenceRequest
): Effect.Effect<InferenceResponse, unknown, SemanticCacheService> {
  return Effect.gen(function* () {
    const cache = yield* SemanticCacheService;
    return yield* cache.completeWithCache(request);
  });
}
