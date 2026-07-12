import type {
  AdaptiveRouter,
  ModelEscalationDecision,
  ModelTier,
  RoutingFailureSignal,
} from "./types.js";
import type { ModelEscalationConfig } from "./config.js";
import { nextModelTier } from "./tiers.js";

export type { ModelEscalationConfig };

export class TierEscalationRouter implements AdaptiveRouter {
  constructor(private readonly config: ModelEscalationConfig) {}

  initialTier(ctx: { isDecomposedChild: boolean; seedId: string }): ModelEscalationDecision {
    if (this.config.modelPin) {
      return {
        tier: "standard",
        modelId: this.config.modelPin,
        retryAttempt: 0,
      };
    }

    const tier: ModelTier = ctx.isDecomposedChild ? "frugal" : "standard";
    return {
      tier,
      modelId: this.config.tierMap[tier],
      retryAttempt: 0,
    };
  }

  escalate(
    decision: ModelEscalationDecision,
    signal: RoutingFailureSignal
  ): ModelEscalationDecision {
    if (this.config.modelPin) {
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
      modelId: this.config.tierMap[nextTier],
      retryAttempt: decision.retryAttempt + 1,
      escalatedFrom: decision.tier,
      trigger: signal,
    };
  }

  /** MoA fan-out at standard-tier exhaustion — implemented in #562. */
  shouldTriggerMoa(
    _decision: ModelEscalationDecision,
    _signals: RoutingFailureSignal[],
    _drift?: { combined: number }
  ): boolean {
    return false;
  }
}
