import type { ModelEscalationDecision } from "./routing/types.js";
import { parseModelId } from "./providers/parse-model-id.js";
import { createProviderRegistry, getProviderAdapter } from "./providers/registry.js";
import type { InferenceProviderPlugin, ProviderRegistry } from "./providers/types.js";
import { composeDefaultProviderPlugins } from "./plugin/compose.js";
import { withInferenceStore } from "./observability/observed-gateway.js";
import { createInferenceStore } from "./store/create.js";
import type { InferenceStore } from "./store/types.js";

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
  correlationId?: string;
}

/**
 * Unified inference entry point for cloud providers, local runtimes, cache, and observability.
 */
export interface InferenceGateway {
  complete(request: InferenceRequest): Promise<InferenceResponse>;
}

export class UnconfiguredInferenceGateway implements InferenceGateway {
  async complete(_request: InferenceRequest): Promise<InferenceResponse> {
    throw new Error(
      "clawql-inference gateway is not configured — set provider API keys or use createInferenceGateway()"
    );
  }
}

export type CreateInferenceGatewayOptions = {
  providers?: ProviderRegistry;
  providerPlugins?: readonly InferenceProviderPlugin[];
  env?: NodeJS.ProcessEnv;
  store?: InferenceStore | null;
};

export class ConfiguredInferenceGateway implements InferenceGateway {
  constructor(private readonly providers: ProviderRegistry) {}

  async complete(request: InferenceRequest): Promise<InferenceResponse> {
    const modelId = request.model ?? request.routing?.modelId;
    if (!modelId) {
      throw new Error("InferenceRequest requires model or routing.modelId");
    }

    const { provider, model } = parseModelId(modelId);
    const adapter = getProviderAdapter(this.providers, provider);
    if (!adapter) {
      throw new Error(`No provider adapter registered for "${provider}"`);
    }

    const response = await adapter.complete(model, request.messages);
    return {
      ...response,
      model: response.model || modelId,
      routing: request.routing,
      correlationId: request.correlationId,
    };
  }
}

export function createInferenceGateway(
  options: CreateInferenceGatewayOptions = {}
): InferenceGateway {
  const env = options.env;
  const providers =
    options.providers ??
    createProviderRegistry({
      env,
      plugins: options.providerPlugins ?? composeDefaultProviderPlugins(),
    });
  const inner = new ConfiguredInferenceGateway(providers);
  const store = options.store === undefined ? createInferenceStore({ env }) : options.store;
  return withInferenceStore(inner, store);
}
