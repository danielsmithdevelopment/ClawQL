import type {
  AdaptiveRouter,
  ModelTier,
  PalRoutingDecision,
  RoutingFailureSignal,
} from "./types.js";
import type { PalRoutingRuntimeConfig } from "./config.js";
import { nextPalTier } from "./tiers.js";

export type { PalRoutingRuntimeConfig };

export class PalAdaptiveRouter implements AdaptiveRouter {
  constructor(private readonly config: PalRoutingRuntimeConfig) {}

  initialTier(ctx: { isDecomposedChild: boolean; seedId: string }): PalRoutingDecision {
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

  escalate(decision: PalRoutingDecision, signal: RoutingFailureSignal): PalRoutingDecision {
    if (this.config.modelPin) {
      return {
        ...decision,
        retryAttempt: decision.retryAttempt + 1,
        trigger: signal,
      };
    }

    const nextTier = nextPalTier(decision.tier);
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

  /** MoA fan-out at Standard exhaustion — implemented in #562. */
  shouldTriggerMoa(
    _pal: PalRoutingDecision,
    _signals: RoutingFailureSignal[],
    _drift?: { combined: number },
  ): boolean {
    return false;
  }
}
