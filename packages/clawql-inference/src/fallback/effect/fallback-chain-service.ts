import { appendInferenceCallToWormEffect, appendInferenceResultToWormEffect } from "clawql-audit";
import { Context, Effect, Result, Layer } from "effect";
import type { InferenceRequest, InferenceResponse } from "../../gateway.js";
import { parseModelId } from "../../providers/parse-model-id.js";
import { filterLocalOnlyModelIds, inferenceLocalOnlyEnabled } from "../../policy/local-only.js";
import { resolveFallbackChain } from "../resolve.js";
import type { FallbackConfig } from "../types.js";
import { FallbackExhaustedError } from "./fallback-errors.js";
import { InferenceGatewayService } from "./inference-gateway-service.js";

function wormAppendRequired(env: NodeJS.ProcessEnv): boolean {
  if (env.CLAWQL_TIER?.trim().toLowerCase() === "regulated") return true;
  const raw = env.CLAWQL_WORM_REQUIRED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function appendHopWorm(
  request: InferenceRequest,
  modelId: string,
  ok: boolean,
  detail: string | undefined,
  env: NodeJS.ProcessEnv
): Effect.Effect<void, Error> {
  const { provider, model } = parseModelId(modelId);
  const call = appendInferenceCallToWormEffect({
    correlationId: request.correlationId,
    modelId,
    provider,
    model,
    tier: request.routing?.tier,
    team: request.team,
    tenantId: request.tenantId,
    virtualKeyId: request.virtualKeyId,
    messageCount: request.messages.length,
    cacheIntent: request.cacheIntent,
  }).pipe(
    Effect.mapError((err) => new Error(err.reason || "fallback hop WORM call failed")),
    Effect.asVoid
  );
  const result = appendInferenceResultToWormEffect({
    correlationId: request.correlationId,
    modelId,
    provider,
    tier: request.routing?.tier,
    virtualKeyId: request.virtualKeyId,
    ok,
    latencyMs: 0,
    detail,
  }).pipe(
    Effect.mapError((err) => new Error(err.reason || "fallback hop WORM result failed")),
    Effect.asVoid
  );
  const both = call.pipe(Effect.flatMap(() => result));
  if (wormAppendRequired(env)) return both;
  return both.pipe(Effect.catch(() => Effect.void));
}

/** Effect service for ordered model fallback within a single `complete()` call. */
export class FallbackChainService extends Context.Service<
  FallbackChainService,
  {
    readonly completeWithFallback: (
      request: InferenceRequest
    ) => Effect.Effect<InferenceResponse, FallbackExhaustedError | unknown>;
  }
>()("clawql/FallbackChainService") {}

export function fallbackChainLiveLayer(
  config: FallbackConfig,
  env: NodeJS.ProcessEnv = process.env
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

          let chain = resolveFallbackChain(request, config.chains);
          if (inferenceLocalOnlyEnabled(env)) {
            chain = filterLocalOnlyModelIds(chain, env);
            if (chain.length === 0) {
              return yield* Effect.fail(
                new FallbackExhaustedError({
                  attempted: [],
                  cause: new Error("local-only fallback chain empty after filter"),
                })
              );
            }
          }
          if (chain.length <= 1) {
            return yield* gateway.complete(request);
          }

          const attempted: string[] = [];
          let lastError: unknown;

          for (const modelId of chain) {
            attempted.push(modelId);
            const result = yield* gateway
              .complete({ ...request, model: modelId })
              .pipe(Effect.result);

            if (Result.isSuccess(result)) {
              // Audit 6.05: record every hop (failed ones below; success on last).
              yield* appendHopWorm(request, modelId, true, undefined, env);
              const primary = request.model ?? request.routing?.modelId ?? modelId;
              if (modelId === primary) {
                return result.success;
              }
              return {
                ...result.success,
                model: result.success.model || modelId,
                fallback: { attempted: [...attempted], succeeded: modelId },
              };
            }
            lastError = result.failure;
            yield* appendHopWorm(
              request,
              modelId,
              false,
              lastError instanceof Error ? lastError.message : String(lastError),
              env
            );
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
