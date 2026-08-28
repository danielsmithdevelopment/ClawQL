export { AnalyticsError, AnalyticsAuthError } from "./errors.js";

export type {
  AnalyticsProvider,
  AnalyticsRegistrySnapshot,
  CustomEvent,
  PageviewEvent,
  ProviderConfig,
  ProviderHealth,
  ProviderHealthStatus,
  RegisteredProvider,
} from "./types.js";

export {
  AnalyticsRegistryService,
  AnalyticsRegistryServiceLive,
  createAnalyticsRegistryLayer,
} from "./registry.js";

export { createPostHogProvider, createNoopAnalyticsProvider } from "./providers/posthog.js";

export {
  ANALYTICS_SCOPES,
  hasAnalyticsScope,
  requireAnalyticsScopeEffect,
  type AnalyticsScope,
  type AnalyticsSessionContext,
} from "./auth-bridge.js";

export {
  logAccessGrantedEffect,
  logAccessRevokedEffect,
  logExportRequestedEffect,
  logProviderAddedEffect,
  logProviderConfigChangeEffect,
  logProviderRemovedEffect,
  logRawDataAccessedEffect,
  type AnalyticsGovernanceEvent,
  type AnalyticsWormEntryType,
} from "./audit-bridge.js";

export {
  AnalyticsService,
  AnalyticsServiceLive,
  AnalyticsLive,
  createAnalyticsLayer,
} from "./service.js";

export type { AggregateAnalyticsStats, PrometheusMetrics } from "./grafana/custom-exporter.js";
export { exportAggregateMetricsEffect } from "./grafana/custom-exporter.js";
