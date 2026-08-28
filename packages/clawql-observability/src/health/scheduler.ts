import { Context, Effect, Layer, Ref } from "effect";

import type {
  ProviderHealth,
  RegisteredProvider,
  SignalProvider,
  SignalType,
} from "../providers/types.js";
import { LogRegistryService } from "../registry/log-registry.js";
import { MetricRegistryService } from "../registry/metric-registry.js";
import { ProfileRegistryService } from "../registry/profile-registry.js";
import { TraceRegistryService } from "../registry/trace-registry.js";

export type ProviderHealthReport = {
  readonly signalType: SignalType;
  readonly providerId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly health: ProviderHealth;
};

export type ObservabilityHealthSnapshot = {
  readonly checkedAt: string;
  readonly providers: readonly ProviderHealthReport[];
};

type RegistryServices =
  | LogRegistryService
  | MetricRegistryService
  | TraceRegistryService
  | ProfileRegistryService;

export class ObservabilityHealthService extends Context.Tag("clawql/ObservabilityHealthService")<
  ObservabilityHealthService,
  {
    readonly runOnce: () => Effect.Effect<ObservabilityHealthSnapshot>;
    readonly getLastSnapshot: () => Effect.Effect<ObservabilityHealthSnapshot | undefined>;
  }
>() {}

const providerHealthEffect = (
  entry: RegisteredProvider<SignalProvider>
): Effect.Effect<ProviderHealth> =>
  entry.enabled
    ? entry.provider.health().pipe(
        Effect.catchAll((cause: unknown) =>
          Effect.succeed({
            status: "down" as const,
            details: cause instanceof Error ? cause.message : String(cause),
          })
        )
      )
    : Effect.succeed({ status: "degraded" as const, details: "provider disabled" });

const collectHealthSnapshot = (input: {
  readonly logEntries: readonly RegisteredProvider<SignalProvider>[];
  readonly metricEntries: readonly RegisteredProvider<SignalProvider>[];
  readonly traceEntries: readonly RegisteredProvider<SignalProvider>[];
  readonly profileEntries: readonly RegisteredProvider<SignalProvider>[];
}): Effect.Effect<ObservabilityHealthSnapshot> =>
  Effect.gen(function* () {
    const checkedAt = new Date().toISOString();
    const reports: ProviderHealthReport[] = [];

    const appendReports = (
      signalType: SignalType,
      entries: readonly RegisteredProvider<SignalProvider>[]
    ) =>
      Effect.gen(function* () {
        for (const entry of entries) {
          const health = yield* providerHealthEffect(entry);
          reports.push({
            signalType,
            providerId: entry.id,
            name: entry.name,
            enabled: entry.enabled,
            health,
          });
        }
      });

    yield* appendReports("log", input.logEntries);
    yield* appendReports("metric", input.metricEntries);
    yield* appendReports("trace", input.traceEntries);
    yield* appendReports("profile", input.profileEntries);

    return { checkedAt, providers: reports };
  });

export const runObservabilityHealthChecksEffect = (): Effect.Effect<
  ObservabilityHealthSnapshot,
  never,
  RegistryServices
> =>
  Effect.gen(function* () {
    const logRegistry = yield* LogRegistryService;
    const metricRegistry = yield* MetricRegistryService;
    const traceRegistry = yield* TraceRegistryService;
    const profileRegistry = yield* ProfileRegistryService;

    return yield* collectHealthSnapshot({
      logEntries: yield* logRegistry.list(),
      metricEntries: yield* metricRegistry.list(),
      traceEntries: yield* traceRegistry.list(),
      profileEntries: yield* profileRegistry.list(),
    });
  });

export const makeObservabilityHealthServiceLayer = (): Layer.Layer<
  ObservabilityHealthService,
  never,
  RegistryServices
> =>
  Layer.effect(
    ObservabilityHealthService,
    Effect.gen(function* () {
      const logRegistry = yield* LogRegistryService;
      const metricRegistry = yield* MetricRegistryService;
      const traceRegistry = yield* TraceRegistryService;
      const profileRegistry = yield* ProfileRegistryService;
      const lastSnapshot = yield* Ref.make<ObservabilityHealthSnapshot | undefined>(undefined);

      const runOnce = () =>
        Effect.gen(function* () {
          const snapshot = yield* collectHealthSnapshot({
            logEntries: yield* logRegistry.list(),
            metricEntries: yield* metricRegistry.list(),
            traceEntries: yield* traceRegistry.list(),
            profileEntries: yield* profileRegistry.list(),
          });
          yield* Ref.set(lastSnapshot, snapshot);
          return snapshot;
        });

      const getLastSnapshot = () => Ref.get(lastSnapshot);

      return { runOnce, getLastSnapshot };
    })
  );

export type HealthSchedulerConfig = {
  readonly intervalMs: number;
};

export class ObservabilityHealthSchedulerService extends Context.Tag(
  "clawql/ObservabilityHealthSchedulerService"
)<
  ObservabilityHealthSchedulerService,
  {
    readonly start: () => Effect.Effect<void>;
    readonly stop: () => Effect.Effect<void>;
  }
>() {}

export const makeObservabilityHealthSchedulerLayer = (
  config: HealthSchedulerConfig
): Layer.Layer<ObservabilityHealthSchedulerService, never, ObservabilityHealthService> =>
  Layer.effect(
    ObservabilityHealthSchedulerService,
    Effect.gen(function* () {
      const health = yield* ObservabilityHealthService;
      const timerRef = yield* Ref.make<ReturnType<typeof setInterval> | undefined>(undefined);

      const start = () =>
        Effect.gen(function* () {
          const existing = yield* Ref.get(timerRef);
          if (existing) {
            return;
          }
          const timer = setInterval(() => {
            void Effect.runPromise(health.runOnce()).catch(() => undefined);
          }, config.intervalMs);
          yield* Ref.set(timerRef, timer);
        });

      const stop = () =>
        Effect.gen(function* () {
          const existing = yield* Ref.get(timerRef);
          if (existing) {
            clearInterval(existing);
            yield* Ref.set(timerRef, undefined);
          }
        });

      return { start, stop };
    })
  );
