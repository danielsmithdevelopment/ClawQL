import type { ModelEscalationDecision } from "./routing/types.js";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface InferenceRequest {
  messages: ChatMessage[];
  model?: string;
  routing?: ModelEscalationDecision;
  correlationId?: string;
}

export interface InferenceUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface InferenceResponse {
  content: string;
  model: string;
  usage?: InferenceUsage;
  cacheHit?: boolean;
  routing?: ModelEscalationDecision;
}

/**
 * Unified inference entry point for cloud providers, local runtimes, cache, and observability.
 * Provider adapters and HTTP surface ship in follow-on PRs.
 */
export interface InferenceGateway {
  complete(request: InferenceRequest): Promise<InferenceResponse>;
}

export class UnconfiguredInferenceGateway implements InferenceGateway {
  async complete(_request: InferenceRequest): Promise<InferenceResponse> {
    throw new Error(
      "clawql-inference gateway is not configured — provider adapters ship in a follow-on PR"
    );
  }
}
