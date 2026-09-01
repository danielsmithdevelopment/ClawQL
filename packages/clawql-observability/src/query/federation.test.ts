import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vitest";

import type { ObservabilityGovernanceEvent } from "../governance/worm.js";
import { ObservabilityGovernanceSink } from "../governance/worm.js";
import {
  LogRegistryService,
  MetricRegistryService,
  ObservabilityRegistryLive,
  createLokiLogProvider,
  createMimirMetricProvider,
  defaultLokiProviderConfig,
  defaultMimirProviderConfig,
  registerBuiltinLgtmProvidersEffect,
} from "../index.js";
import { ObservabilityQueryService, makeObservabilityQueryServiceLayer } from "./federation.js";
import { TelemetryQueryTransport } from "./transport.js";

const timeRange = { startMs: 1_700_000_000_000, endMs: 1_700_000_060_000 };

const makeQueryTestLayer = (events: Ref.Ref<ObservabilityGovernanceEvent[]>) => {
  const sinkLayer = Layer.succeed(ObservabilityGovernanceSink, {
    append: (event) => Ref.update(events, (current) => [...current, event]),
  });

  const transportLayer = Layer.succeed(TelemetryQueryTransport, {
    getJson: ({ url }) =>
      Effect.succeed({
        status: "success",
        data: { resultType: "matrix", result: [{ url }] },
      }),
  });

  const queryLayer = makeObservabilityQueryServiceLayer().pipe(
    Layer.provide(ObservabilityRegistryLive),
    Layer.provide(transportLayer),
    Layer.provide(sinkLayer)
  );

  return Layer.mergeAll(ObservabilityRegistryLive, transportLayer, sinkLayer, queryLayer);
};

describe("observability query federation", () => {
  it("queries primary log provider with scope and WORM audit", async () => {
    const events = Effect.runSync(Ref.make<ObservabilityGovernanceEvent[]>([]));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const query = yield* ObservabilityQueryService;
        return yield* query.queryLogs(
          { sub: "reader-1", scope: ["observability:query_logs"] },
          { logql: '{service="api"}', timeRange }
        );
      }).pipe(Effect.provide(makeQueryTestLayer(events)))
    );

    expect(result.signalType).toBe("log");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.providerId).toBe("lgtm-loki");
    const payload = result.results[0]?.payload as {
      data: { result: Array<{ url: string }> };
    };
    expect(payload.data.result[0]?.url).toContain("/loki/api/v1/query_range");

    const recorded = Effect.runSync(Ref.get(events));
    expect(recorded.some((event) => event.type === "OBSERVABILITY_RAW_DATA_ACCESSED")).toBe(true);
  });

  it("fans out log queries to all enabled providers", async () => {
    const events = Effect.runSync(Ref.make<ObservabilityGovernanceEvent[]>([]));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* LogRegistryService;
        yield* registry.register(createLokiLogProvider(), defaultLokiProviderConfig());
        yield* registry.register(
          { ...createLokiLogProvider(), id: "loki-replica", name: "Loki replica" },
          { ...defaultLokiProviderConfig(), endpoint: "http://loki-replica:3100" }
        );
        const query = yield* ObservabilityQueryService;
        return yield* query.queryLogs(
          { sub: "reader-1", scope: ["observability:query_logs"] },
          {
            logql: '{job="varlogs"}',
            timeRange,
            selection: { mode: "all" },
          }
        );
      }).pipe(Effect.provide(makeQueryTestLayer(events)))
    );

    expect(result.results.map((entry) => entry.providerId).sort()).toEqual([
      "lgtm-loki",
      "loki-replica",
    ]);
  });

  it("denies metric queries without query_metrics scope", async () => {
    const events = Effect.runSync(Ref.make<ObservabilityGovernanceEvent[]>([]));

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const query = yield* ObservabilityQueryService;
        return yield* query.queryMetrics(
          { sub: "reader-1", scope: ["observability:query_logs"] },
          { promql: "up", timeRange }
        );
      }).pipe(Effect.provide(makeQueryTestLayer(events)))
    );

    expect(exit._tag).toBe("Failure");
  });

  it("queries metrics, traces, and profiles via dialect endpoints", async () => {
    const events = Effect.runSync(Ref.make<ObservabilityGovernanceEvent[]>([]));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const query = yield* ObservabilityQueryService;
        const metrics = yield* query.queryMetrics(
          { sub: "reader-1", scope: ["observability:query_metrics"] },
          {
            promql: "rate(http_requests_total[5m])",
            timeRange,
            stepSeconds: 30,
          }
        );
        const traces = yield* query.queryTraces(
          { sub: "reader-1", scope: ["observability:query_traces"] },
          { traceql: '{ resource.service.name = "api" }', timeRange }
        );
        const profiles = yield* query.queryProfiles(
          { sub: "reader-1", scope: ["observability:query_profiles"] },
          {
            query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service="api"}',
            timeRange,
          }
        );
        return { metrics, traces, profiles };
      }).pipe(Effect.provide(makeQueryTestLayer(events)))
    );

    expect(result.metrics.signalType).toBe("metric");
    expect(result.traces.signalType).toBe("trace");
    expect(result.profiles.signalType).toBe("profile");
    expect(result.metrics.results[0]?.providerId).toBe("lgtm-mimir");
    expect(result.traces.results[0]?.providerId).toBe("lgtm-tempo");
    expect(result.profiles.results[0]?.providerId).toBe("lgtm-pyroscope");
  });

  it("selects one metric provider by id", async () => {
    const events = Effect.runSync(Ref.make<ObservabilityGovernanceEvent[]>([]));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* MetricRegistryService;
        yield* registry.register(createMimirMetricProvider(), defaultMimirProviderConfig());
        yield* registry.register(
          {
            ...createMimirMetricProvider(),
            id: "mimir-replica",
            name: "Mimir replica",
          },
          { ...defaultMimirProviderConfig(), endpoint: "http://mimir-replica:9009" }
        );

        const query = yield* ObservabilityQueryService;
        return yield* query.queryMetrics(
          { sub: "reader-1", scope: ["observability:query_metrics"] },
          {
            promql: "up",
            timeRange,
            selection: { mode: "one", providerId: "mimir-replica" },
          }
        );
      }).pipe(Effect.provide(makeQueryTestLayer(events)))
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.providerId).toBe("mimir-replica");
  });
});
