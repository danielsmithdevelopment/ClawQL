export type {
  ModelTierMap,
  ModelTier,
  RoutingFailureKind,
  RoutingFailureSignal,
  ModelEscalationDecision,
  AdaptiveRouter,
} from "./routing/types.js";

export {
  MODEL_TIER_ORDER,
  nextModelTier,
  loadModelEscalationConfig,
  createModelEscalationRouter,
  TierEscalationRouter,
  type ModelEscalationConfig,
} from "./routing/index.js";

export type {
  ChatRole,
  ChatMessage,
  InferenceRequest,
  InferenceResponse,
  InferenceUsage,
  InferenceGateway,
  CreateInferenceGatewayOptions,
} from "./gateway.js";

export {
  UnconfiguredInferenceGateway,
  ConfiguredInferenceGateway,
  createInferenceGateway,
} from "./gateway.js";

export { parseModelId } from "./providers/parse-model-id.js";
export type {
  InferenceProviderAdapter,
  ProviderAdapterConfig,
  InferenceProviderPlugin,
  InferenceProviderRegistrationContext,
  ProviderRegistry,
  CreateProviderRegistryOptions,
} from "./providers/types.js";
export {
  createProviderRegistry,
  registerProviderPlugins,
  getProviderAdapter,
  resolveProviderPluginFlags,
} from "./providers/registry.js";

export {
  composeDefaultProviderPlugins,
  composeProviderPlugins,
  createOpenAiProviderPlugin,
  createAnthropicProviderPlugin,
  createOllamaProviderPlugin,
  createOpenAiAdapter,
  createAnthropicAdapter,
  createOllamaAdapter,
} from "./plugin/index.js";

export {
  createInferenceHttpApp,
  runInferenceHttpServer,
  resolveInferencePort,
  resolveInferenceHost,
  type CreateInferenceHttpAppOptions,
} from "./api/server.js";

export { runInferenceServe } from "./cli/serve.js";
export { runInferenceComplete, type InferenceCompleteOptions } from "./cli/complete.js";

/** Optional context passed to host engines (Wonder / Reflect / Execute). */
export interface EngineCallContext {
  seedId: string;
  generationNumber: number;
  routing?: import("./routing/types.js").ModelEscalationDecision;
}
