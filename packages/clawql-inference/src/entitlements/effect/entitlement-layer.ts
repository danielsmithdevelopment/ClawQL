import { Cause, Effect, Exit, Layer } from "effect";
import {
  paymentsServicesLiveLayer,
} from "clawql-payments/plugin";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../../gateway.js";
import { inferenceGatewayLiveLayer } from "../../fallback/effect/inference-gateway-service.js";
import { EntitlementLimitError } from "../errors.js";
import {
  EntitlementEnforcementService,
  entitlementEnforcementLiveLayer,
} from "./entitlement-enforcement-service.js";

export type EntitlementServices = EntitlementEnforcementService;

export function makeEntitlementLayer(
  inner: InferenceGateway,
  env: NodeJS.ProcessEnv
): Layer.Layer<EntitlementEnforcementService> {
  return entitlementEnforcementLiveLayer(env).pipe(
    Layer.provide(
      Layer.mergeAll(inferenceGatewayLiveLayer(inner), paymentsServicesLiveLayer(env))
    )
  );
}

function squashEntitlementFailure(cause: Cause.Cause<unknown>): never {
  const err = Cause.squash(cause);
  if (err instanceof EntitlementLimitError) {
    throw err;
  }
  throw err;
}

/** Run an entitlement Effect program with gateway + payments layers. */
export async function runEntitlementEffect<A>(
  program: Effect.Effect<A, unknown, EntitlementServices>,
  inner: InferenceGateway,
  env: NodeJS.ProcessEnv = process.env
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    program.pipe(Effect.provide(makeEntitlementLayer(inner, env)))
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  squashEntitlementFailure(exit.cause);
}

/** Complete with entitlement enforcement via Effect services. */
export function completeWithEnforcementProgram(
  request: InferenceRequest
): Effect.Effect<InferenceResponse, unknown, EntitlementEnforcementService> {
  return Effect.gen(function* () {
    const enforcement = yield* EntitlementEnforcementService;
    return yield* enforcement.completeWithEnforcement(request);
  });
}
