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
    options?: InferenceCompleteOptions
  ): Promise<InferenceResponse>;
  /** Optional SSE token stream (OpenAI-compatible upstream). */
  streamComplete?(
    model: string,
    messages: ChatMessage[],
    options?: InferenceCompleteOptions
  ): AsyncIterable<string>;
  /**
   * Raw OpenAI-compatible chat completion passthrough (preserves tools / tool_calls).
   * Used when the client sends tool schemas that the text-only gateway path strips.
   */
  proxyChatCompletion?(
    upstreamModel: string,
    body: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<Record<string, unknown>>;
  /** Raw upstream SSE body for streaming tool calling. */
  proxyChatCompletionStream?(
    upstreamModel: string,
    body: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<ReadableStream<Uint8Array>>;
}

export type InferenceCompleteOptions = {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string | string[];
  /** Layer 4 — apply provider prompt-cache markers when supported. */
  promptCacheEnabled?: boolean;
  /** Layer 11 — assistant prefill opener when supported. */
  prefillOpener?: string;
};

export type ProviderRegistry = Map<string, InferenceProviderAdapter>;

export type InferenceProviderRegistrationContext = {
  env: NodeJS.ProcessEnv;
  registry: ProviderRegistry;
};

/**
 * Optional inference provider plugin — mirrors horizontal MCP plugins but registers
 * `provider/model` backends instead of MCP tools.
 */
export interface InferenceProviderPlugin {
  readonly id: string;
  readonly version: string;
  /** When true, included in `composeDefaultProviderPlugins()`. */
  readonly builtin?: boolean;
  onRegister(ctx: InferenceProviderRegistrationContext): void;
}

export type CreateProviderRegistryOptions = {
  env?: NodeJS.ProcessEnv;
  plugins?: readonly InferenceProviderPlugin[];
  allowlist?: readonly string[];
  denylist?: readonly string[];
};
