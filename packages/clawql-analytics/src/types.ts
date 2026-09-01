import type { Effect } from "effect";

import type { AnalyticsError } from "./errors.js";

export type ProviderHealthStatus = "healthy" | "degraded" | "down";

export type ProviderHealth = {
  readonly status: ProviderHealthStatus;
  readonly details?: string;
};

export type ProviderConfig = {
  readonly apiKey?: string;
  readonly host?: string;
  readonly projectId?: string;
  readonly [key: string]: unknown;
};

export type PageviewEvent = {
  readonly path: string;
  readonly referrer?: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly properties?: Record<string, unknown>;
};

export type CustomEvent = {
  readonly name: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly properties?: Record<string, unknown>;
};

/**
 * Minimal provider contract — capture, identify, pageview, health only.
 * Funnels, retention, and cohort analysis stay in the provider dashboard.
 */
export type AnalyticsProvider = {
  readonly id: string;
  readonly name: string;
  readonly initialize: (config: ProviderConfig) => Effect.Effect<void, AnalyticsError>;
  readonly pageview: (event: PageviewEvent) => Effect.Effect<void, AnalyticsError>;
  readonly capture: (event: CustomEvent) => Effect.Effect<void, AnalyticsError>;
  readonly identify: (
    sessionId: string,
    traits?: Record<string, unknown>
  ) => Effect.Effect<void, AnalyticsError>;
  readonly health: () => Effect.Effect<ProviderHealth, AnalyticsError>;
};

export type RegisteredProvider = {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;
  readonly provider: AnalyticsProvider;
};

export type AnalyticsRegistrySnapshot = {
  readonly activeProviderId: string | null;
  readonly providers: readonly RegisteredProvider[];
};
