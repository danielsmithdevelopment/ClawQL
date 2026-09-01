import type { Effect } from "effect";

import type { ObservabilityError } from "../errors.js";

export type QueryTimeRange = {
  readonly startMs: number;
  readonly endMs: number;
};

export type FederatedQueryMode = "one" | "all" | "primary";

export type FederatedQuerySelection = {
  readonly mode: FederatedQueryMode;
  /** Required when mode is `one`. */
  readonly providerId?: string;
  /** Preferred when mode is `primary`; falls back to first enabled provider. */
  readonly primaryProviderId?: string;
};

export type LogQueryRequest = {
  readonly logql: string;
  readonly timeRange: QueryTimeRange;
  readonly limit?: number;
  readonly selection?: FederatedQuerySelection;
};

export type MetricQueryRequest = {
  readonly promql: string;
  readonly timeRange: QueryTimeRange;
  /** Prometheus step duration in seconds (default 60). */
  readonly stepSeconds?: number;
  readonly selection?: FederatedQuerySelection;
};

export type TraceQueryRequest = {
  readonly traceql: string;
  readonly timeRange: QueryTimeRange;
  readonly limit?: number;
  readonly selection?: FederatedQuerySelection;
};

export type ProfileQueryRequest = {
  readonly query: string;
  readonly timeRange: QueryTimeRange;
  readonly selection?: FederatedQuerySelection;
};

export type ProviderQueryHit = {
  readonly providerId: string;
  readonly payload: unknown;
};

export type FederatedQueryResult = {
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly results: readonly ProviderQueryHit[];
};

/** HTTP JSON transport — Effect-only; Live uses fetch, tests substitute a Layer. */
export type TelemetryQueryTransportApi = {
  readonly getJson: (input: {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
  }) => Effect.Effect<unknown, ObservabilityError>;
};
