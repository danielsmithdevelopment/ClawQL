import { Context, Effect, Layer } from "effect";

import { ObservabilityError } from "../errors.js";
import {
  logRawDataAccessedEffect,
} from "../governance/worm.js";
import type { ObservabilityGovernanceSink } from "../governance/worm.js";
import { LogRegistryService } from "../registry/log-registry.js";
import { MetricRegistryService } from "../registry/metric-registry.js";
import { ProfileRegistryService } from "../registry/profile-registry.js";
import { TraceRegistryService } from "../registry/trace-registry.js";
import {
  ObservabilityAuthError,
  requireObservabilityScopeEffect,
  type ObservabilitySessionContext,
} from "../scopes.js";
import {
  appendQueryParamsEffect,
  resolveQueryEndpointEffect,
  selectProvidersEffect,
  tenantHeadersEffect,
} from "./select.js";
import { TelemetryQueryTransport } from "./transport.js";
import type {
  FederatedQueryResult,
  LogQueryRequest,
  MetricQueryRequest,
  ProfileQueryRequest,
  ProviderQueryHit,
  TraceQueryRequest,
} from "./types.js";

export type ObservabilityQueryServiceApi = {
  readonly queryLogs: (
    session: ObservabilitySessionContext,
    request: LogQueryRequest
  ) => Effect.Effect<
    FederatedQueryResult,
    ObservabilityError | ObservabilityAuthError,
    ObservabilityGovernanceSink
  >;
  readonly queryMetrics: (
    session: ObservabilitySessionContext,
    request: MetricQueryRequest
  ) => Effect.Effect<
    FederatedQueryResult,
    ObservabilityError | ObservabilityAuthError,
    ObservabilityGovernanceSink
  >;
  readonly queryTraces: (
    session: ObservabilitySessionContext,
    request: TraceQueryRequest
  ) => Effect.Effect<
    FederatedQueryResult,
    ObservabilityError | ObservabilityAuthError,
    ObservabilityGovernanceSink
  >;
  readonly queryProfiles: (
    session: ObservabilitySessionContext,
    request: ProfileQueryRequest
  ) => Effect.Effect<
    FederatedQueryResult,
    ObservabilityError | ObservabilityAuthError,
    ObservabilityGovernanceSink
  >;
};

export class ObservabilityQueryService extends Context.Tag("clawql/ObservabilityQueryService")<
  ObservabilityQueryService,
  ObservabilityQueryServiceApi
>() {}

type QueryServiceDeps =
  | LogRegistryService
  | MetricRegistryService
  | TraceRegistryService
  | ProfileRegistryService
  | TelemetryQueryTransport;

export const makeObservabilityQueryService = (): Effect.Effect<
  ObservabilityQueryServiceApi,
  never,
  QueryServiceDeps
> =>
  Effect.gen(function* () {
    const logRegistry = yield* LogRegistryService;
    const metricRegistry = yield* MetricRegistryService;
    const traceRegistry = yield* TraceRegistryService;
    const profileRegistry = yield* ProfileRegistryService;
    const transport = yield* TelemetryQueryTransport;

    const queryLogs: ObservabilityQueryServiceApi["queryLogs"] = (session, request) =>
      Effect.gen(function* () {
        yield* requireObservabilityScopeEffect(session, "observability:query_logs");
        const providers = yield* selectProvidersEffect(
          yield* logRegistry.list(),
          request.selection
        );
        const results: ProviderQueryHit[] = [];
        for (const entry of providers) {
          const base = yield* resolveQueryEndpointEffect(
            entry.config,
            "/loki/api/v1/query_range"
          );
          const url = yield* appendQueryParamsEffect(base, {
            query: request.logql,
            start: request.timeRange.startMs * 1_000_000,
            end: request.timeRange.endMs * 1_000_000,
            limit: request.limit ?? 100,
          });
          const headers = yield* tenantHeadersEffect(entry.config);
          const payload = yield* transport.getJson({ url, headers });
          yield* logRawDataAccessedEffect({
            actorId: session.sub,
            providerId: entry.id,
            signalType: "log",
            detail: { query: request.logql },
          });
          results.push({ providerId: entry.id, payload });
        }
        return { signalType: "log" as const, results };
      });

    const queryMetrics: ObservabilityQueryServiceApi["queryMetrics"] = (session, request) =>
      Effect.gen(function* () {
        yield* requireObservabilityScopeEffect(session, "observability:query_metrics");
        const providers = yield* selectProvidersEffect(
          yield* metricRegistry.list(),
          request.selection
        );
        const results: ProviderQueryHit[] = [];
        for (const entry of providers) {
          const base = yield* resolveQueryEndpointEffect(
            entry.config,
            "/prometheus/api/v1/query_range"
          );
          const url = yield* appendQueryParamsEffect(base, {
            query: request.promql,
            start: Math.floor(request.timeRange.startMs / 1000),
            end: Math.floor(request.timeRange.endMs / 1000),
            step: request.stepSeconds ?? 60,
          });
          const headers = yield* tenantHeadersEffect(entry.config);
          const payload = yield* transport.getJson({ url, headers });
          yield* logRawDataAccessedEffect({
            actorId: session.sub,
            providerId: entry.id,
            signalType: "metric",
            detail: { query: request.promql },
          });
          results.push({ providerId: entry.id, payload });
        }
        return { signalType: "metric" as const, results };
      });

    const queryTraces: ObservabilityQueryServiceApi["queryTraces"] = (session, request) =>
      Effect.gen(function* () {
        yield* requireObservabilityScopeEffect(session, "observability:query_traces");
        const providers = yield* selectProvidersEffect(
          yield* traceRegistry.list(),
          request.selection
        );
        const results: ProviderQueryHit[] = [];
        for (const entry of providers) {
          const base = yield* resolveQueryEndpointEffect(entry.config, "/api/search");
          const url = yield* appendQueryParamsEffect(base, {
            q: request.traceql,
            start: Math.floor(request.timeRange.startMs / 1000),
            end: Math.floor(request.timeRange.endMs / 1000),
            limit: request.limit ?? 20,
          });
          const headers = yield* tenantHeadersEffect(entry.config);
          const payload = yield* transport.getJson({ url, headers });
          yield* logRawDataAccessedEffect({
            actorId: session.sub,
            providerId: entry.id,
            signalType: "trace",
            detail: { query: request.traceql },
          });
          results.push({ providerId: entry.id, payload });
        }
        return { signalType: "trace" as const, results };
      });

    const queryProfiles: ObservabilityQueryServiceApi["queryProfiles"] = (session, request) =>
      Effect.gen(function* () {
        yield* requireObservabilityScopeEffect(session, "observability:query_profiles");
        const providers = yield* selectProvidersEffect(
          yield* profileRegistry.list(),
          request.selection
        );
        const results: ProviderQueryHit[] = [];
        for (const entry of providers) {
          const base = yield* resolveQueryEndpointEffect(entry.config, "/render");
          const url = yield* appendQueryParamsEffect(base, {
            query: request.query,
            from: request.timeRange.startMs,
            until: request.timeRange.endMs,
          });
          const headers = yield* tenantHeadersEffect(entry.config);
          const payload = yield* transport.getJson({ url, headers });
          yield* logRawDataAccessedEffect({
            actorId: session.sub,
            providerId: entry.id,
            signalType: "profile",
            detail: { query: request.query },
          });
          results.push({ providerId: entry.id, payload });
        }
        return { signalType: "profile" as const, results };
      });

    return { queryLogs, queryMetrics, queryTraces, queryProfiles };
  });

export const makeObservabilityQueryServiceLayer = (): Layer.Layer<
  ObservabilityQueryService,
  never,
  QueryServiceDeps
> => Layer.effect(ObservabilityQueryService, makeObservabilityQueryService());
