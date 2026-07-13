import type { ModelEscalationDecision } from "./routing/types.js";
import type { FallbackAttempt } from "./fallback/types.js";
import { parseModelId } from "./providers/parse-model-id.js";
import { createProviderRegistry, getProviderAdapter } from "./providers/registry.js";
import type { InferenceProviderPlugin, ProviderRegistry } from "./providers/types.js";
import { composeDefaultProviderPlugins } from "./plugin/compose.js";
import { withInferenceStore } from "./observability/observed-gateway.js";
import { withInferenceTracing } from "./observability/traced-gateway.js";
import { createInferenceStore } from "./store/create.js";
import type { InferenceStore } from "./store/types.js";
import { withSemanticCache, type WithSemanticCacheOptions } from "./cache/cached-gateway.js";
import { createSemanticCacheStore } from "./cache/postgres-pgvector-store.js";
import { loadSemanticCacheConfig } from "./cache/types.js";
import { InMemorySemanticCacheStore } from "./cache/in-memory.js";
import { loadFallbackConfig } from "./fallback/config.js";
import { withFallbackChain, type WithFallbackChainOptions } from "./fallback/fallback-gateway.js";
import { withEntitlementEnforcement } from "./entitlements/enforced-gateway.js";
import { withTokenEfficiency } from "./efficiency/efficiency-gateway.js";
import type { CacheIntent } from "./efficiency/types.js";
import { resolveInferenceEffectiveEnv } from "./policy/manifest.js";

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
  team?: string;
  tenantId?: string;
  virtualKeyId?: string;
  /** Layer 5 — read vs write cache safety (`auto` infers from message text). */
  cacheIntent?: CacheIntent;
  maxTokens?: number;
  /** Layer 4 — provider prompt-cache markers (set by TokenEfficiencyGateway). */
  promptCacheEnabled?: boolean;
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
  fallback?: FallbackAttempt;
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
  semanticCache?: WithSemanticCacheOptions | false;
  fallback?: WithFallbackChainOptions | false;
  /** Emit OTLP spans (infra + Langfuse) when configured. Default true. */
  tracing?: boolean;
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

    const response = await adapter.complete(model, request.messages, {
      promptCacheEnabled: request.promptCacheEnabled,
    });
    return {
      ...response,
      model: response.model || modelId,
      routing: request.routing,
      correlationId: request.correlationId,
    };
  }
}

function withRuntimePolicyEnv(
  options: CreateInferenceGatewayOptions
): CreateInferenceGatewayOptions {
  const env = resolveInferenceEffectiveEnv(options.env ?? process.env);
  return { ...options, env };
}

function composeInferenceGateway(
  inner: InferenceGateway,
  options: CreateInferenceGatewayOptions
): InferenceGateway {
  const env = options.env;
  const fallbackConfig =
    options.fallback === false ? null : (options.fallback?.config ?? loadFallbackConfig(env));
  const withFallback =
    options.fallback === false || !fallbackConfig
      ? inner
      : withFallbackChain(inner, { config: fallbackConfig });

  let semanticOptions = options.semanticCache;
  if (semanticOptions !== false && !semanticOptions?.cache) {
    const config = semanticOptions?.config ?? loadSemanticCacheConfig(env);
    if (config.enabled) {
      semanticOptions = {
        ...semanticOptions,
        config,
        cache: new InMemorySemanticCacheStore({
          enabled: config.enabled,
          threshold: config.threshold,
          ttlMs: config.ttlMs,
          maxEntries: config.maxEntries,
        }),
      };
    }
  }

  const cached =
    options.semanticCache === false
      ? withFallback
      : withSemanticCache(withFallback, { env, ...semanticOptions });
  const efficient = withTokenEfficiency(cached, { env });
  const entitled = withEntitlementEnforcement(efficient, env);
  const store = options.store === undefined ? createInferenceStore({ env }) : options.store;
  const observed = withInferenceStore(entitled, store, env);
  if (options.tracing === false) return observed;
  return withInferenceTracing(observed, env);
}

export function createInferenceGateway(
  options: CreateInferenceGatewayOptions = {}
): InferenceGateway {
  const resolved = withRuntimePolicyEnv(options);
  const env = resolved.env;
  const providers =
    resolved.providers ??
    createProviderRegistry({
      env,
      plugins: resolved.providerPlugins ?? composeDefaultProviderPlugins(),
    });
  const inner = new ConfiguredInferenceGateway(providers);
  return composeInferenceGateway(inner, resolved);
}

/** Async gateway bootstrap — selects Postgres pgvector semantic cache when configured. */
export async function createInferenceGatewayAsync(
  options: CreateInferenceGatewayOptions = {}
): Promise<InferenceGateway> {
  const resolved = withRuntimePolicyEnv(options);
  const env = resolved.env;
  const providers =
    resolved.providers ??
    createProviderRegistry({
      env,
      plugins: resolved.providerPlugins ?? composeDefaultProviderPlugins(),
    });
  const inner = new ConfiguredInferenceGateway(providers);

  let semanticOptions = resolved.semanticCache;
  if (semanticOptions !== false && !semanticOptions?.cache) {
    const config = semanticOptions?.config ?? loadSemanticCacheConfig(env);
    if (config.enabled) {
      semanticOptions = {
        ...semanticOptions,
        config,
        cache: await createSemanticCacheStore(config, env),
      };
    }
  }

  return composeInferenceGateway(inner, { ...resolved, semanticCache: semanticOptions });
}
