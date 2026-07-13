import { Context, Effect, Either, Layer } from "effect";
import type { InferenceRequest, InferenceResponse } from "../../gateway.js";
import { InferenceGatewayService } from "../../fallback/effect/inference-gateway-service.js";
import { createSemanticCacheEntry } from "../in-memory.js";
import { buildCacheSignatureText, hashSystemPrompt } from "../signature.js";
import type { SemanticCacheConfig } from "../types.js";
import { EmbedderService } from "./embedder-service.js";
import { SemanticCacheStoreService } from "./semantic-cache-store-service.js";

/** Effect service for semantic cache lookup/store around gateway completion. */
export class SemanticCacheService extends Context.Tag("clawql/SemanticCacheService")<
  SemanticCacheService,
  {
    readonly completeWithCache: (
      request: InferenceRequest
    ) => Effect.Effect<InferenceResponse, unknown>;
  }
>() {}

export function semanticCacheLiveLayer(
  config: SemanticCacheConfig
): Layer.Layer<
  SemanticCacheService,
  never,
  InferenceGatewayService | EmbedderService | SemanticCacheStoreService
> {
  return Layer.effect(
    SemanticCacheService,
    Effect.gen(function* () {
      const gateway = yield* InferenceGatewayService;
      const embedder = yield* EmbedderService;
      const store = yield* SemanticCacheStoreService;

      const completeWithCache = (request: InferenceRequest) =>
        Effect.gen(function* () {
          if (!config.enabled) {
            return yield* gateway.complete(request);
          }

          const modelId = request.model ?? request.routing?.modelId;
          if (!modelId) {
            return yield* gateway.complete(request);
          }

          const signatureText = buildCacheSignatureText(request.messages);
          const embeddingResult = yield* embedder.embed(signatureText).pipe(Effect.either);
          if (Either.isLeft(embeddingResult) || embeddingResult.right.length === 0) {
            return yield* gateway.complete(request);
          }
          const embedding = embeddingResult.right;

          const hit = yield* store.lookup({
            modelId,
            embedding,
            threshold: config.threshold,
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

          const response = yield* gateway.complete(request);
          yield* store.put(
            createSemanticCacheEntry({
              modelId,
              signatureText,
              systemPromptHash: hashSystemPrompt(request.messages),
              embedding,
              response: { ...response, cacheHit: false },
              ttlMs: config.ttlMs,
            })
          );
          return response;
        });

      return SemanticCacheService.of({ completeWithCache });
    })
  );
}
