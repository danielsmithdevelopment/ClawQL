import type { Effect } from "effect";

import type { ObservabilityError } from "../errors.js";

export type SignalType = "log" | "metric" | "trace" | "profile";

export type ProviderHealthStatus = "healthy" | "degraded" | "down";

export type ProviderHealth = {
  readonly status: ProviderHealthStatus;
  readonly details?: string;
};

/** Shared provider configuration — secrets referenced by env key, not inlined. */
export type ProviderConfig = {
  readonly endpoint?: string;
  readonly tenantId?: string;
  readonly enabled?: boolean;
  /** When true, health() probes the endpoint (default false in tests). */
  readonly probeReachability?: boolean;
  readonly [key: string]: unknown;
};

type ProviderBase<TSignal extends SignalType> = {
  readonly id: string;
  readonly name: string;
  readonly signalType: TSignal;
  readonly initialize: (config: ProviderConfig) => Effect.Effect<void, ObservabilityError>;
  readonly health: () => Effect.Effect<ProviderHealth, ObservabilityError>;
};

/** Logs — Loki, Elasticsearch, Datadog logs API, … */
export type LogProvider = ProviderBase<"log">;

/** Metrics — Mimir, Prometheus remote_write, Grafana Cloud, … */
export type MetricProvider = ProviderBase<"metric">;

/** Traces — Tempo, Jaeger, Honeycomb, … */
export type TraceProvider = ProviderBase<"trace">;

/** Profiles — Pyroscope, Grafana Cloud profiles, … */
export type ProfileProvider = ProviderBase<"profile">;

export type SignalProvider = LogProvider | MetricProvider | TraceProvider | ProfileProvider;

export type RegisteredProvider<T extends SignalProvider> = {
  readonly id: string;
  readonly name: string;
  readonly config: ProviderConfig;
  readonly provider: T;
  readonly enabled: boolean;
};

export type SignalRegistrySnapshot<T extends SignalProvider> = {
  readonly providers: readonly RegisteredProvider<T>[];
};
