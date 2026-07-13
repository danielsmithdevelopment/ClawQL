import { Context, Effect, Layer } from "effect";
import type { ModelEscalationConfig } from "../config.js";
import { nextModelTier } from "../tiers.js";
import type {
  ModelEscalationDecision,
  ModelTier,
  RoutingFailureSignal,
} from "../types.js";

/** Combined drift threshold for agent coordination tripwire (#562). */
export const AGENT_COORDINATION_DRIFT_TRIPWIRE = 0.3;

function computeInitialTier(
  config: ModelEscalationConfig,
  ctx: { isDecomposedChild: boolean; seedId: string }
): ModelEscalationDecision {
  if (config.modelPin) {
    return {
      tier: "standard",
      modelId: config.modelPin,
      retryAttempt: 0,
    };
  }

  const tier: ModelTier = ctx.isDecomposedChild ? "frugal" : "standard";
  return {
    tier,
    modelId: config.tierMap[tier],
    retryAttempt: 0,
  };
}

function computeEscalation(
  config: ModelEscalationConfig,
  decision: ModelEscalationDecision,
  signal: RoutingFailureSignal
): ModelEscalationDecision {
  if (config.modelPin) {
    return {
      ...decision,
      retryAttempt: decision.retryAttempt + 1,
      trigger: signal,
    };
  }

  const nextTier = nextModelTier(decision.tier);
  if (!nextTier) {
    return {
      ...decision,
      retryAttempt: decision.retryAttempt + 1,
      trigger: signal,
    };
  }

  return {
    tier: nextTier,
    modelId: config.tierMap[nextTier],
    retryAttempt: decision.retryAttempt + 1,
    escalatedFrom: decision.tier,
    trigger: signal,
  };
}

function computeShouldTriggerAgentCoordination(
  decision: ModelEscalationDecision,
  signals: RoutingFailureSignal[],
  drift?: { combined: number }
): boolean {
  if (!signals.length) return false;
  const driftTripwire = (drift?.combined ?? 0) > AGENT_COORDINATION_DRIFT_TRIPWIRE;
  const standardTierFailure = decision.tier === "standard" && signals.length > 0;
  return driftTripwire || standardTierFailure;
}

/** Effect service for frugal → standard → frontier model tier escalation. */
export class ModelEscalationService extends Context.Tag("clawql/ModelEscalationService")<
  ModelEscalationService,
  {
    readonly initialTier: (ctx: {
      isDecomposedChild: boolean;
      seedId: string;
    }) => Effect.Effect<ModelEscalationDecision>;
    readonly escalate: (
      decision: ModelEscalationDecision,
      signal: RoutingFailureSignal
    ) => Effect.Effect<ModelEscalationDecision>;
    readonly shouldTriggerAgentCoordination: (
      decision: ModelEscalationDecision,
      signals: RoutingFailureSignal[],
      drift?: { combined: number }
    ) => Effect.Effect<boolean>;
  }
>() {}

export function modelEscalationLiveLayer(
  config: ModelEscalationConfig
): Layer.Layer<ModelEscalationService> {
  return Layer.succeed(
    ModelEscalationService,
    ModelEscalationService.of({
      initialTier: (ctx) => Effect.sync(() => computeInitialTier(config, ctx)),
      escalate: (decision, signal) =>
        Effect.sync(() => computeEscalation(config, decision, signal)),
      shouldTriggerAgentCoordination: (decision, signals, drift) =>
        Effect.sync(() => computeShouldTriggerAgentCoordination(decision, signals, drift)),
    })
  );
}

/** Run a model escalation Effect program with config layer. */
export async function runModelEscalationEffect<A>(
  program: Effect.Effect<A, unknown, ModelEscalationService>,
  config: ModelEscalationConfig
): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provide(modelEscalationLiveLayer(config))));
}

/** Sync access to model escalation service (used by {@link TierEscalationRouter}). */
export function resolveModelEscalationService(config: ModelEscalationConfig) {
  return Effect.runSync(
    Effect.gen(function* () {
      return yield* ModelEscalationService;
    }).pipe(Effect.provide(modelEscalationLiveLayer(config)))
  );
}
