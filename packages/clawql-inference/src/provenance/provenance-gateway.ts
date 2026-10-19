/**
 * InferenceGateway decorator — deny before any provider call, on the resolved model id.
 * Placed inside the fallback chain so every attempt (including failover) is checked.
 */

import { appendInferenceCallToWormEffect, appendInferenceResultToWormEffect } from "clawql-audit";
import { Effect, Result } from "effect";
import type { InferenceGateway, InferenceRequest, InferenceResponse } from "../gateway.js";
import { resolveCatalogAlias } from "../catalog/index.js";
import {
  assertModelProvenanceEffect,
  isModelProvenanceDeniedError,
  type ModelProvenanceDeniedError,
} from "./gate.js";
import {
  loadModelProvenancePolicyEffect,
  type ModelProvenancePolicy,
} from "./policy.js";
import type { ModelIdentity } from "./identity.js";

function resolveAttemptModelId(request: InferenceRequest): string {
  const raw = request.model ?? request.routing?.modelId;
  if (!raw?.trim()) {
    throw new Error("InferenceRequest requires model or routing.modelId for provenance check");
  }
  return resolveCatalogAlias(raw.trim());
}

function recordDenyWorm(
  request: InferenceRequest,
  identity: ModelIdentity,
  err: ModelProvenanceDeniedError
): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* appendInferenceCallToWormEffect({
      correlationId: request.correlationId,
      modelId: identity.resolvedId,
      provider: identity.vendor,
      model: identity.canonicalId,
      tier: request.routing?.tier,
      team: request.team,
      tenantId: request.tenantId,
      virtualKeyId: request.virtualKeyId,
      messageCount: request.messages.length,
      cacheIntent: request.cacheIntent,
    }).pipe(Effect.catch(() => Effect.void));

    yield* appendInferenceResultToWormEffect({
      correlationId: request.correlationId,
      modelId: identity.resolvedId,
      provider: identity.vendor,
      tier: request.routing?.tier,
      virtualKeyId: request.virtualKeyId,
      ok: false,
      latencyMs: 0,
      detail: `provenance_denied:${err.message}`,
    }).pipe(Effect.catch(() => Effect.void));
  });
}

function completeWithProvenance(
  inner: InferenceGateway,
  policy: ModelProvenancePolicy,
  request: InferenceRequest
): Effect.Effect<InferenceResponse, unknown> {
  return Effect.gen(function* () {
    const attemptId = resolveAttemptModelId(request);
    const asserted = yield* assertModelProvenanceEffect(attemptId, policy).pipe(Effect.result);
    if (Result.isFailure(asserted)) {
      const err = asserted.failure;
      if (isModelProvenanceDeniedError(err)) {
        yield* recordDenyWorm(request, err.identity, err);
      }
      return yield* Effect.fail(err);
    }
    const resolvedRequest: InferenceRequest = {
      ...request,
      model: asserted.success.resolvedId,
    };
    return yield* Effect.tryPromise({
      try: () => inner.complete(resolvedRequest),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
  });
}

export class ProvenanceGuardedInferenceGateway implements InferenceGateway {
  constructor(
    private readonly inner: InferenceGateway,
    private readonly policy: ModelProvenancePolicy
  ) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    return Effect.runPromise(completeWithProvenance(this.inner, this.policy, request));
  }
}

export type WithModelProvenanceOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly policy?: ModelProvenancePolicy;
  /** When false, skip wrapping even if policy would enable. */
  readonly enabled?: boolean;
};

export function withModelProvenance(
  gateway: InferenceGateway,
  options: WithModelProvenanceOptions = {}
): InferenceGateway {
  const env = options.env ?? process.env;
  const policy = options.policy ?? Effect.runSync(loadModelProvenancePolicyEffect(env));
  if (options.enabled === false || !policy.enabled) return gateway;
  return new ProvenanceGuardedInferenceGateway(gateway, policy);
}
