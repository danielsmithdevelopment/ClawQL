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
  loadModelEscalationConfigAsync,
  createModelEscalationRouter,
  TierEscalationRouter,
  ModelEscalationService,
  modelEscalationLiveLayer,
  resolveModelEscalationService,
  runModelEscalationEffect,
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
  createInferenceGatewayAsync,
} from "./gateway.js";

export {
  EntitlementEnforcedGateway,
  EntitlementLimitError,
  assertInferenceEntitlement,
  isEntitlementLimitError,
  isInferenceEntitlementEnforcementActive,
  recordInferenceUsage,
  resolveInferenceTenantId,
  withEntitlementEnforcement,
} from "./entitlements/enforced-gateway.js";
export {
  EntitlementEnforcementService,
  assertInferenceEntitlementEffect,
  completeWithEnforcementProgram,
  entitlementEnforcementLiveLayer,
  makeEntitlementLayer,
  recordInferenceBillingEffect,
  recordInferenceUsageEffect,
  resolveInferenceTenantIdEffect,
  runEntitlementEffect,
  type EntitlementServices,
} from "./entitlements/effect/index.js";

export type {
  InferenceRecord,
  InferenceStore,
  InferenceListQuery,
  SpendGroupBy,
} from "./store/types.js";
export {
  createInferenceStore,
  resolveInferenceStoreBackend,
  resolveInferenceStorePath,
  type CreateInferenceStoreOptions,
} from "./store/create.js";
export { InMemoryInferenceStore } from "./store/in-memory.js";
export { JsonlInferenceStore } from "./store/jsonl.js";
export { ObservedInferenceGateway, withInferenceStore } from "./observability/observed-gateway.js";
export { TracedInferenceGateway, withInferenceTracing } from "./observability/traced-gateway.js";
export {
  maybeInitInferenceOtelTracing,
  inferenceTracingFeatureEnabled,
  withInferenceSpan,
} from "./observability/otel-tracing.js";
export {
  resolveObservabilityProfile,
  langfuseTracingEnabled,
  otelInfraTracingEnabled,
  inferenceTracingEnabled,
} from "./observability/profile.js";
export { resolveLangfuseOtlpConfig } from "./observability/langfuse-config.js";
export { parseSinceDuration } from "./observability/parse-since.js";
export { runInferenceLogs, runInferenceTrace, runInferenceSpend } from "./cli/observability.js";
export { runInferenceExportCli, type InferenceExportCliOptions } from "./cli/export.js";
export {
  runInferenceFinetune,
  runInferenceFinetuneStatus,
  runInferenceFinetuneRegister,
  runInferenceFinetuneRefit,
  type InferenceFinetuneOptions,
} from "./cli/finetune.js";
export { runInferenceExport, type RunInferenceExportOptions } from "./export/run-export.js";
export type { ExportFormat, DatasetManifest } from "./export/types.js";
export { submitFinetuneJob, getFinetuneJobStatus, registerFinetuneModel } from "./finetune/jobs.js";
export type { FinetuneJob, FinetuneProvider } from "./finetune/types.js";
export { registerModelToTier, loadTierMapOverrides } from "./finetune/tier-registry.js";

export {
  buildModelEscalationAuditEntry,
  buildAgentCoordinationAuditEntry,
  type InferenceAuditEntry,
} from "./audit/events.js";
export {
  appendInferenceAuditToProcessWorm,
  appendInferenceAuditToProcessWormEffect,
} from "./audit/process-worm.js";
export { runInferenceEscalationShow, runInferenceEscalationSetTier } from "./cli/escalation.js";
export {
  runInferencePipelineEnable,
  runInferencePipelineStatus,
  runInferencePipelineDisable,
  runInferencePipelineRun,
  runInferencePipelineWorker,
} from "./cli/pipeline.js";
export { AGENT_COORDINATION_DRIFT_TRIPWIRE } from "./routing/tier-escalation-router.js";
export { loadPipelineConfig, savePipelineConfig } from "./pipeline/config.js";
export { runPipelineOnce } from "./pipeline/run.js";
export type { InferencePipelineConfig } from "./pipeline/types.js";

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
  createOpenRouterProviderPlugin,
  createOpenAiCompatByokProviderPlugin,
  createOpenAiCompatByokProviderPlugins,
  OPENAI_COMPAT_BYOK_PROVIDERS,
  OPENAI_PROVIDER_PLUGIN_ID,
  ANTHROPIC_PROVIDER_PLUGIN_ID,
  OLLAMA_PROVIDER_PLUGIN_ID,
  OPENROUTER_PROVIDER_PLUGIN_ID,
  createOpenAiAdapter,
  createAnthropicAdapter,
  createOllamaAdapter,
  createOpenRouterAdapter,
  createOpenAiCompatibleAdapter,
} from "./plugin/index.js";
export type { OpenAiCompatProviderSpec, OpenAiCompatibleAdapterConfig } from "./plugin/index.js";

export {
  DEFAULT_INFERENCE_MODEL_CATALOG,
  loadInferenceModelCatalog,
  resolveCatalogAlias,
  findCatalogModel,
  providerCredentialPresent,
  PROVIDER_API_KEY_ENV,
  type CatalogModel,
  type InferenceModelCatalog,
} from "./catalog/index.js";

export {
  createInferenceHttpApp,
  runInferenceHttpServer,
  resolveInferencePort,
  resolveInferenceHost,
  type CreateInferenceHttpAppOptions,
} from "./api/server.js";
export { resolveRequestModel, toPublicModelId } from "./api/model-resolve.js";
export { collectListedModels } from "./api/models.js";

export { runInferenceServe } from "./cli/serve.js";
export { runInferenceComplete, type InferenceCompleteOptions } from "./cli/complete.js";
export { runInferenceCacheStatus, type InferenceCacheStatusOptions } from "./cli/cache.js";
export {
  withSemanticCache,
  SemanticCachedGateway,
  isSemanticCachedGateway,
  type WithSemanticCacheOptions,
} from "./cache/cached-gateway.js";
export {
  createSemanticCacheStore,
  resolveSemanticCacheBackend,
  PostgresSemanticCacheStore,
  type SemanticCacheBackend,
} from "./cache/postgres-pgvector-store.js";
export {
  loadSemanticCacheConfig,
  semanticCacheActive,
  type SemanticCacheConfig,
  type SemanticCacheStats,
} from "./cache/types.js";
export { cosineSimilarity, resolveInferenceEmbeddingConfig } from "./cache/embedding.js";
export { buildCacheSignatureText, hashSystemPrompt } from "./cache/signature.js";
export {
  EmbedderService,
  SemanticCacheService,
  SemanticCacheStoreService,
  completeWithSemanticCacheProgram,
  embedderLiveLayer,
  makeSemanticCacheLayer,
  runSemanticCacheEffect,
  semanticCacheLiveLayer,
  semanticCacheStoreLiveLayer,
  type SemanticCacheServices,
} from "./cache/effect/index.js";
export {
  withFallbackChain,
  FallbackChainGateway,
  isFallbackChainGateway,
  type WithFallbackChainOptions,
} from "./fallback/fallback-gateway.js";
export {
  loadFallbackConfig,
  loadFallbackConfigAsync,
  resolveFallbackChainsPath,
  saveFallbackChainsFile,
} from "./fallback/config.js";
export { resolveFallbackChain, normalizeFallbackChain } from "./fallback/resolve.js";
export type { FallbackAttempt, FallbackChainMap, FallbackConfig } from "./fallback/types.js";
export {
  FallbackExhaustedError,
  FallbackChainService,
  InferenceGatewayService,
  completeWithFallbackProgram,
  fallbackChainLiveLayer,
  inferenceGatewayLiveLayer,
  makeFallbackLayer,
  runFallbackEffect,
  type FallbackServices,
} from "./fallback/effect/index.js";
export { runInferenceFallbackShow, type InferenceFallbackShowOptions } from "./cli/fallback.js";
export {
  runInferenceKeysCreate,
  runInferenceKeysList,
  runInferenceKeysRevoke,
  type InferenceKeysCreateOptions,
  type InferenceKeysListOptions,
  type InferenceKeysRevokeOptions,
} from "./cli/keys.js";
export { loadKeysConfig, resolveVirtualKeysPath } from "./keys/config.js";
export {
  createVirtualKey,
  revokeVirtualKey,
  listVirtualKeys,
  keysEnforcementActive,
  redactVirtualKey,
} from "./keys/store.js";
export { validateVirtualKey, extractPresentedApiKey } from "./keys/validate.js";
export { createVirtualKeyAuthMiddleware, type VirtualKeyRequest } from "./api/auth.js";
export type { VirtualKey, VirtualKeyContext, KeysConfig, RateLimitSpec } from "./keys/types.js";
export { resolveInferencePolicy, type InferencePolicyView } from "./policy/resolve.js";
export {
  loadInferencePolicyManifestSync,
  resolvePolicyManifestPath,
  resolveInferenceEffectiveEnv,
  parseInferencePolicyManifestText,
  type InferencePolicyManifest,
} from "./policy/manifest.js";
export { runInferencePolicyShow, type InferencePolicyShowOptions } from "./cli/policy.js";
export {
  evaluateAgentCoordination,
  type AgentCoordinationEvaluation,
} from "./coordination/trigger.js";
export {
  invokeAgentCoordination,
  type AgentCoordinationResult,
  type AgentCoordinationMode,
} from "./coordination/hermes-adapter.js";
export { PostgresInferenceStore } from "./store/postgres.js";
export {
  getInferencePgPool,
  ensureInferenceSchema,
  closeInferencePgPool,
} from "./store/postgres-pool.js";
export { cronMatchesUtc } from "./pipeline/cron.js";
export {
  buildPipelineRunLockKey,
  tryAcquirePipelineAdvisoryLock,
  pipelineAdvisoryLockId,
} from "./pipeline/advisory-lock.js";
export {
  startPipelineWorker,
  stopPipelineWorker,
  runPipelineWorkerTickOnce,
} from "./pipeline/worker.js";

export {
  loadTokenEfficiencyConfig,
  listEfficiencyLayerStatus,
  withTokenEfficiency,
  TokenEfficiencyGateway,
  applyTerseOutput,
  resolveCacheIntent,
  isAutoRouteModel,
  type TokenEfficiencyConfig,
  type EfficiencyLayerId,
  type CacheIntent,
} from "./efficiency/index.js";

/** Optional context passed to host engines (Wonder / Reflect / Execute). */
export interface EngineCallContext {
  seedId: string;
  generationNumber: number;
  routing?: import("./routing/types.js").ModelEscalationDecision;
}
