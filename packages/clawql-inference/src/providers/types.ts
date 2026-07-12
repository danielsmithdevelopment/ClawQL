import type { ChatMessage, InferenceResponse } from "../gateway.js";

export interface ProviderAdapterConfig {
  apiKey?: string;
  baseUrl: string;
}

export interface InferenceProviderAdapter {
  readonly provider: string;
  complete(
    model: string,
    messages: ChatMessage[],
    options?: { signal?: AbortSignal }
  ): Promise<InferenceResponse>;
}
