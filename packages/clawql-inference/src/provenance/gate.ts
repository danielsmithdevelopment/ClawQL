/**
 * Evaluate model provenance policy against a *resolved* model identity.
 */

import { Context, Effect, Layer } from "effect";
import { identifyModelEffect, type ModelIdentity } from "./identity.js";
import type { ModelProvenancePolicy } from "./policy.js";
import { loadModelProvenancePolicyEffect } from "./policy.js";

export class ModelProvenanceDeniedError extends Error {
  readonly code = "model_provenance_denied" as const;
  readonly identity: ModelIdentity;
  readonly policyMode: ModelProvenancePolicy["mode"];
  readonly policyProfile: ModelProvenancePolicy["profile"];

  constructor(input: {
    readonly identity: ModelIdentity;
    readonly policy: ModelProvenancePolicy;
    readonly reason: string;
  }) {
    super(input.reason);
    this.name = "ModelProvenanceDeniedError";
    this.identity = input.identity;
    this.policyMode = input.policy.mode;
    this.policyProfile = input.policy.profile;
  }
}

export function isModelProvenanceDeniedError(err: unknown): err is ModelProvenanceDeniedError {
  return err instanceof ModelProvenanceDeniedError;
}

export type ProvenanceDecision =
  | { readonly allow: true; readonly identity: ModelIdentity }
  | {
      readonly allow: false;
      readonly identity: ModelIdentity;
      readonly reason: string;
    };

export function evaluateModelProvenanceEffect(
  requestedOrResolvedId: string,
  policy: ModelProvenancePolicy
): Effect.Effect<ProvenanceDecision> {
  return Effect.gen(function* () {
    const identity = yield* identifyModelEffect(requestedOrResolvedId);

    if (!policy.enabled) {
      return { allow: true as const, identity };
    }

    const vendor = identity.vendor.toLowerCase();
    const resolvedNorm = identity.resolvedId.trim().toLowerCase();
    const canonicalNorm = identity.canonicalId.trim().toLowerCase();

    if (policy.deniedVendors.has(vendor)) {
      return {
        allow: false as const,
        identity,
        reason: `Model provenance policy denied vendor "${vendor}" (resolved ${identity.resolvedId}; requested ${identity.requestedId})`,
      };
    }

    if (policy.mode === "deny") {
      return { allow: true as const, identity };
    }

    // allowlist fail-closed
    if (
      policy.allowedModels.has(resolvedNorm) ||
      policy.allowedModels.has(canonicalNorm) ||
      policy.allowedModels.has(identity.requestedId.trim().toLowerCase())
    ) {
      return { allow: true as const, identity };
    }

    if (identity.known && policy.allowedVendors.has(vendor)) {
      return { allow: true as const, identity };
    }

    if (!identity.known) {
      return {
        allow: false as const,
        identity,
        reason: `Model provenance allowlist denied unknown model "${identity.resolvedId}" (fail closed; profile=${policy.profile})`,
      };
    }

    return {
      allow: false as const,
      identity,
      reason: `Model provenance allowlist denied vendor "${vendor}" (resolved ${identity.resolvedId}; profile=${policy.profile})`,
    };
  });
}

export function assertModelProvenanceEffect(
  requestedOrResolvedId: string,
  policy: ModelProvenancePolicy
): Effect.Effect<ModelIdentity, ModelProvenanceDeniedError> {
  return Effect.gen(function* () {
    const decision = yield* evaluateModelProvenanceEffect(requestedOrResolvedId, policy);
    if (!decision.allow) {
      return yield* Effect.fail(
        new ModelProvenanceDeniedError({
          identity: decision.identity,
          policy,
          reason: decision.reason,
        })
      );
    }
    return decision.identity;
  });
}

/** Load policy from env and assert — for decision / embedding / other model-call edges. */
export function assertModelProvenanceFromEnvEffect(
  requestedOrResolvedId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ModelIdentity, ModelProvenanceDeniedError> {
  return Effect.gen(function* () {
    const policy = yield* loadModelProvenancePolicyEffect(env);
    return yield* assertModelProvenanceEffect(requestedOrResolvedId, policy);
  });
}

export class ModelProvenanceGateService extends Context.Service<
  ModelProvenanceGateService,
  {
    readonly assertAllowed: (
      modelId: string
    ) => Effect.Effect<ModelIdentity, ModelProvenanceDeniedError>;
    readonly evaluate: (modelId: string) => Effect.Effect<ProvenanceDecision>;
  }
>()("clawql/ModelProvenanceGateService") {}

export function modelProvenanceGateLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<ModelProvenanceGateService> {
  return Layer.effect(
    ModelProvenanceGateService,
    Effect.gen(function* () {
      const policy = yield* loadModelProvenancePolicyEffect(env);
      return ModelProvenanceGateService.of({
        assertAllowed: (modelId) => assertModelProvenanceEffect(modelId, policy),
        evaluate: (modelId) => evaluateModelProvenanceEffect(modelId, policy),
      });
    })
  );
}
