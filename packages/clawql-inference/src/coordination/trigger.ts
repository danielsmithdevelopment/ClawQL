import type {
  AdaptiveRouter,
  ModelEscalationDecision,
  RoutingFailureSignal,
} from "../routing/types.js";
import { buildAgentCoordinationAuditEntry } from "../audit/events.js";
import { appendInferenceAuditToProcessWorm } from "../audit/process-worm.js";
import { invokeAgentCoordination } from "./hermes-adapter.js";

export type AgentCoordinationEvaluation = {
  triggered: boolean;
  auditEntry?: ReturnType<typeof buildAgentCoordinationAuditEntry>;
  result?: Awaited<ReturnType<typeof invokeAgentCoordination>>;
};

export async function evaluateAgentCoordination(input: {
  router: AdaptiveRouter;
  decision: ModelEscalationDecision;
  signals: RoutingFailureSignal[];
  driftCombined?: number;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<AgentCoordinationEvaluation> {
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
  const result = await invokeAgentCoordination({
    decision: input.decision,
    signals: input.signals,
    env: input.env,
  });
  await appendInferenceAuditToProcessWorm(auditEntry);
  return { triggered: true, auditEntry, result };
}
