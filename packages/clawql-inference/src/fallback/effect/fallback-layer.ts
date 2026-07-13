import { Cause, Effect, Exit, Layer } from "effect";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import type { FallbackConfig } from "../types.js";
import { FallbackExhaustedError } from "./fallback-errors.js";
import { FallbackChainService, fallbackChainLiveLayer } from "./fallback-chain-service.js";
import {
  InferenceGatewayService,
  inferenceGatewayLiveLayer,
} from "./inference-gateway-service.js";

export type FallbackServices = FallbackChainService;

export function makeFallbackLayer(
  inner: InferenceGateway,
  config: FallbackConfig
): Layer.Layer<FallbackChainService> {
  return fallbackChainLiveLayer(config).pipe(Layer.provide(inferenceGatewayLiveLayer(inner)));
}

function squashFallbackFailure(cause: Cause.Cause<unknown>): never {
  const err = Cause.squash(cause);
  if (err instanceof FallbackExhaustedError) {
    if (err.cause instanceof Error) {
      throw err.cause;
    }
    throw new Error(
      `All fallback models failed (${err.attempted.join(" → ")}): ${String(err.cause)}`
    );
  }
  throw err;
}

/** Run a fallback Effect program with gateway + config layers. */
export async function runFallbackEffect<A>(
  program: Effect.Effect<A, unknown, FallbackServices>,
  inner: InferenceGateway,
  config: FallbackConfig
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(makeFallbackLayer(inner, config)))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  squashFallbackFailure(exit.cause);
}

/** Complete with fallback chain via Effect services (used by {@link FallbackChainGateway}). */
export function completeWithFallbackProgram(
  request: InferenceRequest
): Effect.Effect<InferenceResponse, unknown, FallbackChainService> {
  return Effect.gen(function* () {
    const fallback = yield* FallbackChainService;
    return yield* fallback.completeWithFallback(request);
  });
}
