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
  action: "model_escalation" | "agent_coordination" | "memory_enrichment";
  summary: string;
  correlationId?: string;
  payload:
    | ModelEscalationAuditPayload
    | AgentCoordinationAuditPayload
    | MemoryEnrichmentAuditPayload;
};

/** Memory IDs / scope only — never vault body text (Evidence tab join). */
export type MemoryEnrichmentAuditPayload = {
  event: "memory_enrichment";
  memoryIds: string[];
  memoryScope?: string;
  virtualKeyId?: string;
  team?: string;
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

export function buildMemoryEnrichmentAuditEntry(input: {
  memoryIds: readonly string[];
  memoryScope?: string;
  virtualKeyId?: string;
  team?: string;
  correlationId?: string;
}): InferenceAuditEntry {
  const ids = [...input.memoryIds];
  const summary = `Memory enrichment injected ${ids.length} note(s)${input.memoryScope ? ` scope=${input.memoryScope}` : ""}`;
  return {
    ts: new Date().toISOString(),
    category: "inference",
    action: "memory_enrichment",
    summary,
    correlationId: input.correlationId,
    payload: {
      event: "memory_enrichment",
      memoryIds: ids,
      memoryScope: input.memoryScope,
      virtualKeyId: input.virtualKeyId,
      team: input.team,
    },
  };
}
