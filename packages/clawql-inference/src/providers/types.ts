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
