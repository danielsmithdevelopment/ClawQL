import { Effect } from "effect";

import { LogRegistryService } from "../registry/log-registry.js";
import { MetricRegistryService } from "../registry/metric-registry.js";
import { ProfileRegistryService } from "../registry/profile-registry.js";
import { TraceRegistryService } from "../registry/trace-registry.js";
import {
  createLokiLogProvider,
  defaultLokiProviderConfig,
  LGTM_LOKI_PROVIDER_ID,
} from "./lgtm-loki.js";
import {
  createMimirMetricProvider,
  defaultMimirProviderConfig,
  LGTM_MIMIR_PROVIDER_ID,
} from "./lgtm-mimir.js";
import {
  createPyroscopeProfileProvider,
  defaultPyroscopeProviderConfig,
  LGTM_PYROSCOPE_PROVIDER_ID,
} from "./lgtm-pyroscope.js";
import {
  createTempoTraceProvider,
  defaultTempoProviderConfig,
  LGTM_TEMPO_PROVIDER_ID,
} from "./lgtm-tempo.js";

/** Register built-in LGTM+ providers when not already present. Idempotent. */
export const registerBuiltinLgtmProvidersEffect = (): Effect.Effect<
  void,
  never,
  LogRegistryService | MetricRegistryService | TraceRegistryService | ProfileRegistryService
> =>
  Effect.gen(function* () {
    const logRegistry = yield* LogRegistryService;
    const metricRegistry = yield* MetricRegistryService;
    const traceRegistry = yield* TraceRegistryService;
    const profileRegistry = yield* ProfileRegistryService;

    const logSnapshot = yield* logRegistry.snapshot();
    if (!logSnapshot.providers.some((entry) => entry.id === LGTM_LOKI_PROVIDER_ID)) {
      const loki = createLokiLogProvider();
      yield* loki.initialize(defaultLokiProviderConfig());
      yield* logRegistry.register(loki, defaultLokiProviderConfig());
    }

    const metricSnapshot = yield* metricRegistry.snapshot();
    if (!metricSnapshot.providers.some((entry) => entry.id === LGTM_MIMIR_PROVIDER_ID)) {
      const mimir = createMimirMetricProvider();
      yield* mimir.initialize(defaultMimirProviderConfig());
      yield* metricRegistry.register(mimir, defaultMimirProviderConfig());
    }

    const traceSnapshot = yield* traceRegistry.snapshot();
    if (!traceSnapshot.providers.some((entry) => entry.id === LGTM_TEMPO_PROVIDER_ID)) {
      const tempo = createTempoTraceProvider();
      yield* tempo.initialize(defaultTempoProviderConfig());
      yield* traceRegistry.register(tempo, defaultTempoProviderConfig());
    }

    const profileSnapshot = yield* profileRegistry.snapshot();
    if (!profileSnapshot.providers.some((entry) => entry.id === LGTM_PYROSCOPE_PROVIDER_ID)) {
      const pyroscope = createPyroscopeProfileProvider();
      yield* pyroscope.initialize(defaultPyroscopeProviderConfig());
      yield* profileRegistry.register(pyroscope, defaultPyroscopeProviderConfig());
    }
  }).pipe(Effect.catchAll(() => Effect.void));
