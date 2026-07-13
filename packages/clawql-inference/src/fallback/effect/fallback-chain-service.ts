import { Context, Effect, Either, Layer } from "effect";
import type { InferenceRequest, InferenceResponse } from "../../gateway.js";
import { resolveFallbackChain } from "../resolve.js";
import type { FallbackConfig } from "../types.js";
import { FallbackExhaustedError } from "./fallback-errors.js";
import { InferenceGatewayService } from "./inference-gateway-service.js";

/** Effect service for ordered model fallback within a single `complete()` call. */
export class FallbackChainService extends Context.Tag("clawql/FallbackChainService")<
  FallbackChainService,
  {
    readonly completeWithFallback: (
      request: InferenceRequest
    ) => Effect.Effect<InferenceResponse, FallbackExhaustedError | unknown>;
  }
>() {}

export function fallbackChainLiveLayer(
  config: FallbackConfig
): Layer.Layer<FallbackChainService, never, InferenceGatewayService> {
  return Layer.effect(
    FallbackChainService,
    Effect.gen(function* () {
      const gateway = yield* InferenceGatewayService;

      const completeWithFallback = (request: InferenceRequest) =>
        Effect.gen(function* () {
          if (!config.enabled) {
            return yield* gateway.complete(request);
          }

          const chain = resolveFallbackChain(request, config.chains);
          if (chain.length <= 1) {
            return yield* gateway.complete(request);
          }

          const attempted: string[] = [];
          let lastError: unknown;

          for (const modelId of chain) {
            attempted.push(modelId);
            const result = yield* gateway
              .complete({ ...request, model: modelId })
              .pipe(Effect.either);

            if (Either.isRight(result)) {
              const primary = request.model ?? request.routing?.modelId ?? modelId;
              if (modelId === primary) {
                return result.right;
              }
              return {
                ...result.right,
                model: result.right.model || modelId,
                fallback: { attempted: [...attempted], succeeded: modelId },
              };
            }
            lastError = result.left;
          }

          return yield* Effect.fail(
            new FallbackExhaustedError({
              attempted,
              cause: lastError,
            })
          );
        });

      return FallbackChainService.of({ completeWithFallback });
    })
  );
}
