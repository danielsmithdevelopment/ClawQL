import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import type { ObservabilityGovernanceEvent } from "./governance/worm.js";
import {
  LogRegistryService,
  LogRegistryServiceLive,
  MetricRegistryService,
  ObservabilityGovernanceSink,
  ObservabilityGovernanceSinkLive,
  ObservabilityHealthService,
  ObservabilityLive,
  ObservabilityRegistryLive,
  ProfileRegistryService,
  TraceRegistryService,
  createLokiLogProvider,
  defaultLokiProviderConfig,
  hasObservabilityScope,
  logProviderAddedEffect,
  registerBuiltinLgtmProvidersEffect,
  registerLogProviderEffect,
  requireObservabilityScopeEffect,
} from "./index.js";

describe("observability provider registry", () => {
  it("registers multiple log providers per signal type", async () => {
    const primary = createLokiLogProvider();
    const secondary = {
      ...createLokiLogProvider(),
      id: "loki-replica",
      name: "Loki replica",
    };

    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* LogRegistryService;
        yield* registry.register(primary, defaultLokiProviderConfig());
        yield* registry.register(secondary, {
          ...defaultLokiProviderConfig(),
          endpoint: "http://loki-replica:3100",
        });
        return yield* registry.snapshot();
      }).pipe(Effect.provide(LogRegistryServiceLive))
    );

    expect(snapshot.providers).toHaveLength(2);
    expect(snapshot.providers.map((entry) => entry.id)).toEqual(["lgtm-loki", "loki-replica"]);
  });

  it("registers built-in LGTM+ providers across all signal registries", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const logs = yield* LogRegistryService;
        const metrics = yield* MetricRegistryService;
        const traces = yield* TraceRegistryService;
        const profiles = yield* ProfileRegistryService;
        return {
          logs: (yield* logs.snapshot()).providers.map((entry) => entry.id),
          metrics: (yield* metrics.snapshot()).providers.map((entry) => entry.id),
          traces: (yield* traces.snapshot()).providers.map((entry) => entry.id),
          profiles: (yield* profiles.snapshot()).providers.map((entry) => entry.id),
        };
      }).pipe(Effect.provide(ObservabilityRegistryLive))
    );

    expect(result.logs).toContain("lgtm-loki");
    expect(result.metrics).toContain("lgtm-mimir");
    expect(result.traces).toContain("lgtm-tempo");
    expect(result.profiles).toContain("lgtm-pyroscope");
  });
});

describe("observability scopes and governance", () => {
  it("enforces configure scope for governed registration", async () => {
    const provider = createLokiLogProvider();
    const session = { sub: "operator-1", scope: ["observability:query_logs"] };

    const deniedExit = await Effect.runPromiseExit(
      registerLogProviderEffect({
        session,
        actorId: "operator-1",
        provider,
        config: defaultLokiProviderConfig(),
      }).pipe(
        Effect.provide(LogRegistryServiceLive),
        Effect.provide(ObservabilityGovernanceSinkLive)
      )
    );

    expect(Exit.isFailure(deniedExit)).toBe(true);
    if (Exit.isFailure(deniedExit)) {
      expect(deniedExit.cause.toString()).toContain("ObservabilityAuthError");
    }

    const scopeDeniedExit = await Effect.runPromiseExit(
      requireObservabilityScopeEffect(session, "observability:configure")
    );
    expect(Exit.isFailure(scopeDeniedExit)).toBe(true);

    expect(
      hasObservabilityScope(
        { sub: "operator-1", scope: ["observability:configure"] },
        "observability:configure"
      )
    ).toBe(true);
  });

  it("writes governance events through the sink", async () => {
    const events: ObservabilityGovernanceEvent[] = [];

    const sinkLayer = Layer.succeed(ObservabilityGovernanceSink, {
      append: (event: ObservabilityGovernanceEvent) =>
        Effect.sync(() => {
          events.push(event);
        }),
    });

    await Effect.runPromise(
      logProviderAddedEffect({
        actorId: "operator-1",
        providerId: "lgtm-loki",
        signalType: "log",
        timestamp: "2026-08-28T00:00:00.000Z",
      }).pipe(Effect.provide(sinkLayer))
    );

    expect(events).toEqual([
      {
        type: "OBSERVABILITY_PROVIDER_ADDED",
        actorId: "operator-1",
        providerId: "lgtm-loki",
        signalType: "log",
        timestamp: "2026-08-28T00:00:00.000Z",
      },
    ]);
  });
});

describe("observability health checks", () => {
  it("returns health snapshots for registered providers", async () => {
    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        yield* registerBuiltinLgtmProvidersEffect();
        const health = yield* ObservabilityHealthService;
        return yield* health.runOnce();
      }).pipe(Effect.provide(ObservabilityLive))
    );

    expect(snapshot.providers.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.providers.every((entry) => entry.health.status === "healthy")).toBe(true);
  });
});
