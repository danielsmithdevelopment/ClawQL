export { ObservabilityError } from "./errors.js";
export { ObservabilityAuthError } from "./scopes.js";

export type {
  FaroExceptionEvent,
  FaroExceptionFrame,
  FaroExceptionPayload,
} from "./fingerprint.js";
export {
  createErrorFingerprint,
  createErrorFingerprintEffect,
  normaliseErrorMessage,
} from "./fingerprint.js";

export {
  defaultLgtmPlusHelmValues,
  readObservabilityProfile,
  readObservabilityProfileEffect,
} from "./config.js";

export type {
  LgtmPlusComponent,
  LgtmPlusComponentConfig,
  LgtmPlusHelmValues,
  LgtmPlusLocalEndpoints,
  LokiConfig,
  MimirConfig,
  ObservabilityProfileConfig,
} from "./types.js";

export {
  defaultLocalEndpoints,
  packagePaths,
  resolvePackagePath,
  resolvePackagePathEffect,
} from "./paths.js";

export type { TelemetryJwtClaims } from "./telemetry-token.js";
export { signTelemetryJwt, signTelemetryJwtEffect } from "./telemetry-token.js";

export type {
  LogProvider,
  MetricProvider,
  ProfileProvider,
  ProviderConfig,
  ProviderHealth,
  ProviderHealthStatus,
  RegisteredProvider,
  SignalProvider,
  SignalRegistrySnapshot,
  SignalType,
  TraceProvider,
} from "./providers/types.js";

export {
  createLokiLogProvider,
  defaultLokiProviderConfig,
  LGTM_LOKI_PROVIDER_ID,
} from "./providers/lgtm-loki.js";
export {
  createMimirMetricProvider,
  defaultMimirProviderConfig,
  LGTM_MIMIR_PROVIDER_ID,
} from "./providers/lgtm-mimir.js";
export {
  createTempoTraceProvider,
  defaultTempoProviderConfig,
  LGTM_TEMPO_PROVIDER_ID,
} from "./providers/lgtm-tempo.js";
export {
  createPyroscopeProfileProvider,
  defaultPyroscopeProviderConfig,
  LGTM_PYROSCOPE_PROVIDER_ID,
} from "./providers/lgtm-pyroscope.js";
export { registerBuiltinLgtmProvidersEffect } from "./providers/lgtm-builtin.js";
export { probeEndpointHealthEffect } from "./providers/health-probe.js";

export { LogRegistryService } from "./registry/log-registry.js";
export { MetricRegistryService } from "./registry/metric-registry.js";
export { TraceRegistryService } from "./registry/trace-registry.js";
export { ProfileRegistryService } from "./registry/profile-registry.js";
export type { SignalRegistryService } from "./registry/signal-registry-core.js";
export {
  createObservabilityRegistryLayer,
  LogRegistryServiceLive,
  MetricRegistryServiceLive,
  ObservabilityHealthLive,
  ObservabilityLive,
  ObservabilityRegistryLive,
  ProfileRegistryServiceLive,
  TraceRegistryServiceLive,
} from "./registry/layers.js";
export {
  registerLogProviderEffect,
  registerMetricProviderEffect,
  registerProfileProviderEffect,
  registerTraceProviderEffect,
  removeLogProviderEffect,
  updateLogProviderConfigEffect,
} from "./registry/governed.js";

export {
  OBSERVABILITY_SCOPES,
  hasObservabilityScope,
  requireObservabilityScopeEffect,
} from "./scopes.js";
export type { ObservabilityScope, ObservabilitySessionContext } from "./scopes.js";

export {
  ObservabilityGovernanceSink,
  ObservabilityGovernanceSinkLive,
  logAlloyConfigAppliedEffect,
  logExportRequestedEffect,
  logProviderAddedEffect,
  logProviderConfigChangeEffect,
  logProviderRemovedEffect,
  logRawDataAccessedEffect,
} from "./governance/worm.js";
export type {
  ObservabilityGovernanceEvent,
  ObservabilityWormEntryType,
} from "./governance/worm.js";

export {
  ObservabilityHealthSchedulerService,
  ObservabilityHealthService,
  makeObservabilityHealthSchedulerLayer,
  runObservabilityHealthChecksEffect,
} from "./health/scheduler.js";
export type { ObservabilityHealthSnapshot, ProviderHealthReport } from "./health/scheduler.js";

export type {
  AlloyGenerationInput,
  AlloyGeneratedConfig,
  AlloyProviderEntry,
} from "./alloy/types.js";
export { generateAlloyRiver, generateAlloyRiverEffect } from "./alloy/generate.js";
export { sanitizeRiverComponentName, sanitizeRiverComponentNameEffect } from "./alloy/sanitize.js";
export { validateAlloyRiver, validateAlloyRiverEffect } from "./alloy/validate.js";
export { applyAlloyConfigEffect } from "./alloy/apply.js";
export type { ApplyAlloyConfigInput, ApplyAlloyConfigResult } from "./alloy/apply.js";
export { snapshotRegistriesForAlloyEffect } from "./alloy/from-registry.js";
