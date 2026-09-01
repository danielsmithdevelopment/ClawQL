import { Cause, Effect, Exit, Layer, ManagedRuntime } from "effect";

import { applyAlloyConfigEffect } from "../alloy/apply.js";
import { snapshotRegistriesForAlloyEffect } from "../alloy/from-registry.js";
import { ObservabilityError } from "../errors.js";
import { resolveObservabilityGovernanceSinkLayer } from "../governance/audit-bridge.js";
import {
  makeObservabilityHealthSchedulerLayer,
  ObservabilityHealthSchedulerService,
  ObservabilityHealthService,
} from "../health/scheduler.js";
import { registerBuiltinLgtmProvidersEffect } from "../providers/lgtm-builtin.js";
import { ObservabilityQueryService } from "../query/federation.js";
import { LogRegistryService } from "../registry/log-registry.js";
import { MetricRegistryService } from "../registry/metric-registry.js";
import { ProfileRegistryService } from "../registry/profile-registry.js";
import { TraceRegistryService } from "../registry/trace-registry.js";
import { ObservabilityGovernanceSink } from "../governance/worm.js";
import { ObservabilityWithQueryLive } from "../registry/layers.js";
import { ObservabilityAuthError } from "../scopes.js";
import { readObservabilityHostConfigEffect } from "./config.js";
import { resolveObservabilitySessionForRuntimeEffect } from "./session-context.js";

export type ObservabilityHostServices =
  | ObservabilityQueryService
  | ObservabilityHealthService
  | ObservabilityHealthSchedulerService
  | ObservabilityGovernanceSink
  | LogRegistryService
  | MetricRegistryService
  | TraceRegistryService
  | ProfileRegistryService;

const readHealthIntervalMs = (env: NodeJS.ProcessEnv): number => {
  const raw = env.CLAWQL_OBSERVABILITY_HEALTH_INTERVAL_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
};

const observabilityHostLayer = (env: NodeJS.ProcessEnv): Layer.Layer<ObservabilityHostServices> => {
  const governance = resolveObservabilityGovernanceSinkLayer(env);
  const scheduler = makeObservabilityHealthSchedulerLayer({
    intervalMs: readHealthIntervalMs(env),
  }).pipe(Layer.provide(ObservabilityWithQueryLive));

  return Layer.mergeAll(ObservabilityWithQueryLive, governance, scheduler);
};

const bootObservabilityHostEffect = (env: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    yield* registerBuiltinLgtmProvidersEffect();

    const scheduler = yield* ObservabilityHealthSchedulerService;
    yield* scheduler.start();

    const config = yield* readObservabilityHostConfigEffect(env);
    if (!config.alloyAutoApply) {
      return;
    }

    const session = yield* resolveObservabilitySessionForRuntimeEffect(env);
    const generation = yield* snapshotRegistriesForAlloyEffect();
    yield* applyAlloyConfigEffect({
      session,
      actorId: session.sub,
      generation,
      outputPath: config.alloyOutputPath,
    });
  }).pipe(Effect.catchAll(() => Effect.void));

let hostRuntime: ManagedRuntime.ManagedRuntime<
  ObservabilityHostServices,
  ObservabilityError | ObservabilityAuthError
> | null = null;
let bootPromise: Promise<void> | null = null;

/** Lazily create and boot the observability host ManagedRuntime (idempotent). */
export const ensureObservabilityHostRuntimeEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<
  ManagedRuntime.ManagedRuntime<
    ObservabilityHostServices,
    ObservabilityError | ObservabilityAuthError
  >
> =>
  Effect.gen(function* () {
    if (hostRuntime) {
      return hostRuntime;
    }

    const runtime = ManagedRuntime.make(observabilityHostLayer(env));
    hostRuntime = runtime;

    if (!bootPromise) {
      bootPromise = runtime.runPromise(bootObservabilityHostEffect(env)).catch(() => undefined);
    }
    yield* Effect.promise(() => bootPromise!);

    return runtime;
  });

/** Run an observability host Effect program (MCP/HTTP thin façades). */
export async function runObservabilityHostEffect<A, E>(
  program: Effect.Effect<A, E, ObservabilityHostServices>,
  env: NodeJS.ProcessEnv = process.env
): Promise<A> {
  const runtime = await Effect.runPromise(ensureObservabilityHostRuntimeEffect(env));
  const exit = await runtime.runPromiseExit(program);
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  throw Cause.squash(exit.cause);
}

/** Test helper — reset singleton runtime between tests. */
export const resetObservabilityHostRuntimeForTests = (): void => {
  hostRuntime = null;
  bootPromise = null;
};
