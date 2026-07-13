import type { ModelEscalationConfig } from "./config.js";
import type {
  AdaptiveRouter,
  ModelEscalationDecision,
  RoutingFailureSignal,
} from "./types.js";
import { Effect } from "effect";
import {
  AGENT_COORDINATION_DRIFT_TRIPWIRE,
  resolveModelEscalationService,
} from "./effect/model-escalation-service.js";

export type { ModelEscalationConfig };
export { AGENT_COORDINATION_DRIFT_TRIPWIRE };

/** Tier escalation router implementing {@link AdaptiveRouter} (sync boundary over Effect). */
export class TierEscalationRouter implements AdaptiveRouter {
  private readonly service: ReturnType<typeof resolveModelEscalationService>;

  constructor(config: ModelEscalationConfig) {
    this.service = resolveModelEscalationService(config);
  }

  initialTier(ctx: { isDecomposedChild: boolean; seedId: string }): ModelEscalationDecision {
    return Effect.runSync(this.service.initialTier(ctx));
  }

  escalate(
    decision: ModelEscalationDecision,
    signal: RoutingFailureSignal
  ): ModelEscalationDecision {
    return Effect.runSync(this.service.escalate(decision, signal));
  }

  shouldTriggerAgentCoordination(
    decision: ModelEscalationDecision,
    signals: RoutingFailureSignal[],
    drift?: { combined: number }
  ): boolean {
    return Effect.runSync(this.service.shouldTriggerAgentCoordination(decision, signals, drift));
  }
}
