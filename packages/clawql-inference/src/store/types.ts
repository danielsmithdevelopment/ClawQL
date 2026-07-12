import type { ChatMessage, InferenceResponse, InferenceUsage } from "../gateway.js";
import type { ModelEscalationDecision } from "../routing/types.js";

export type EvaluatorVerdict = "passed" | "failed" | "none";

/** Durable inference call record — feeds observability and export (epic #556). */
export interface InferenceRecord {
  id: string;
  correlationId?: string;
  timestamp: string;
  modelId: string;
  provider: string;
  tier?: string;
  team?: string;
  virtualKeyId?: string;
  messages: ChatMessage[];
  response: string;
  usage?: InferenceUsage;
  latencyMs: number;
  cacheHit?: boolean;
  routing?: ModelEscalationDecision;
  evaluatorVerdict: EvaluatorVerdict;
  evaluatorScore?: number;
  policyVersion?: string;
}

export type InferenceListQuery = {
  modelId?: string;
  provider?: string;
  tier?: string;
  correlationId?: string;
  since?: Date;
  limit?: number;
};

export type SpendGroupBy = "model" | "provider" | "tier" | "team";

export type SpendRow = {
  key: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
};

export interface InferenceStore {
  append(record: InferenceRecord): Promise<void>;
  list(query?: InferenceListQuery): Promise<InferenceRecord[]>;
  getByCorrelationId(correlationId: string): Promise<InferenceRecord[]>;
  spendRollup(options?: { since?: Date; groupBy?: SpendGroupBy }): Promise<SpendRow[]>;
}

export type InferenceStoreBackend = "off" | "memory" | "jsonl" | "postgres";

export function buildInferenceRecord(input: {
  id: string;
  request: {
    messages: ChatMessage[];
    model?: string;
    routing?: ModelEscalationDecision;
    correlationId?: string;
    team?: string;
    virtualKeyId?: string;
  };
  response: InferenceResponse;
  provider: string;
  model: string;
  latencyMs: number;
}): InferenceRecord {
  return {
    id: input.id,
    correlationId: input.request.correlationId ?? input.response.correlationId,
    timestamp: new Date().toISOString(),
    modelId: input.response.model || input.request.model || `${input.provider}/${input.model}`,
    provider: input.provider,
    tier: input.request.routing?.tier ?? input.response.routing?.tier,
    team: input.request.team,
    virtualKeyId: input.request.virtualKeyId,
    messages: input.request.messages,
    response: input.response.content,
    usage: input.response.usage,
    latencyMs: input.latencyMs,
    cacheHit: input.response.cacheHit,
    routing: input.request.routing ?? input.response.routing,
    evaluatorVerdict: "none",
  };
}
