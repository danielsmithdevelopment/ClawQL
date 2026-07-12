import type { ModelEscalationDecision, RoutingFailureSignal } from "../routing/types.js";

export type InferenceAuditCategory = "inference";

export type ModelEscalationAuditPayload = {
  event: "model_escalation";
  tierBefore: string;
  tierAfter: string;
  modelBefore: string;
  modelAfter: string;
  trigger?: RoutingFailureSignal;
  retryAttempt: number;
  inputTokens?: number;
  outputTokens?: number;
};

export type AgentCoordinationAuditPayload = {
  event: "agent_coordination";
  tier: string;
  modelId: string;
  driftCombined?: number;
  failureCount: number;
  triggers: RoutingFailureSignal[];
};

export type InferenceAuditEntry = {
  ts: string;
  category: InferenceAuditCategory;
  action: "model_escalation" | "agent_coordination";
  summary: string;
  correlationId?: string;
  payload: ModelEscalationAuditPayload | AgentCoordinationAuditPayload;
};

export function buildModelEscalationAuditEntry(input: {
  before: ModelEscalationDecision;
  after: ModelEscalationDecision;
  correlationId?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}): InferenceAuditEntry {
  const summary = `Model tier escalation ${input.before.tier}→${input.after.tier} (${input.before.modelId} → ${input.after.modelId})`;
  return {
    ts: new Date().toISOString(),
    category: "inference",
    action: "model_escalation",
    summary,
    correlationId: input.correlationId,
    payload: {
      event: "model_escalation",
      tierBefore: input.before.tier,
      tierAfter: input.after.tier,
      modelBefore: input.before.modelId,
      modelAfter: input.after.modelId,
      trigger: input.after.trigger,
      retryAttempt: input.after.retryAttempt,
      inputTokens: input.usage?.inputTokens,
      outputTokens: input.usage?.outputTokens,
    },
  };
}

export function buildAgentCoordinationAuditEntry(input: {
  decision: ModelEscalationDecision;
  signals: RoutingFailureSignal[];
  driftCombined?: number;
  correlationId?: string;
}): InferenceAuditEntry {
  const summary = `Agent coordination triggered at ${input.decision.tier} (drift=${input.driftCombined ?? "n/a"})`;
  return {
    ts: new Date().toISOString(),
    category: "inference",
    action: "agent_coordination",
    summary,
    correlationId: input.correlationId,
    payload: {
      event: "agent_coordination",
      tier: input.decision.tier,
      modelId: input.decision.modelId,
      driftCombined: input.driftCombined,
      failureCount: input.signals.length,
      triggers: input.signals,
    },
  };
}
