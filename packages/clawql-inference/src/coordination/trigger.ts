import { Effect } from "effect";
import type {
  AdaptiveRouter,
  ModelEscalationDecision,
  RoutingFailureSignal,
} from "../routing/types.js";
import { buildAgentCoordinationAuditEntry } from "../audit/events.js";
import { appendInferenceAuditToProcessWormEffect } from "../audit/process-worm.js";
import { invokeAgentCoordinationEffect } from "./hermes-adapter.js";

export type AgentCoordinationEvaluation = {
  triggered: boolean;
  auditEntry?: ReturnType<typeof buildAgentCoordinationAuditEntry>;
  result?: Awaited<ReturnType<typeof import("./hermes-adapter.js").invokeAgentCoordination>>;
};

export function evaluateAgentCoordinationEffect(input: {
  router: AdaptiveRouter;
  decision: ModelEscalationDecision;
  signals: RoutingFailureSignal[];
  driftCombined?: number;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
}): Effect.Effect<AgentCoordinationEvaluation> {
  return Effect.gen(function* () {
    if (
      !input.router.shouldTriggerAgentCoordination(input.decision, input.signals, {
        combined: input.driftCombined ?? 0,
      })
    ) {
      return { triggered: false };
    }

    const auditEntry = buildAgentCoordinationAuditEntry({
      decision: input.decision,
      signals: input.signals,
      driftCombined: input.driftCombined,
      correlationId: input.correlationId,
    });
    const result = yield* invokeAgentCoordinationEffect({
      decision: input.decision,
      signals: input.signals,
      env: input.env,
    });
    yield* appendInferenceAuditToProcessWormEffect(auditEntry);
    return { triggered: true, auditEntry, result };
  });
}

/** Promise façade. */
export async function evaluateAgentCoordination(input: {
  router: AdaptiveRouter;
  decision: ModelEscalationDecision;
  signals: RoutingFailureSignal[];
  driftCombined?: number;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<AgentCoordinationEvaluation> {
  return Effect.runPromise(evaluateAgentCoordinationEffect(input));
}
