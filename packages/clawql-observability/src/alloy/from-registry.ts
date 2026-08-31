import { Effect } from "effect";

import type {
  LogProvider,
  MetricProvider,
  ProfileProvider,
  RegisteredProvider,
  SignalProvider,
  TraceProvider,
} from "../providers/types.js";
import { LogRegistryService } from "../registry/log-registry.js";
import { MetricRegistryService } from "../registry/metric-registry.js";
import { ProfileRegistryService } from "../registry/profile-registry.js";
import { TraceRegistryService } from "../registry/trace-registry.js";
import type { AlloyGenerationInput, AlloyProviderEntry } from "./types.js";

const toEntry = <T extends SignalProvider>(
  registered: RegisteredProvider<T>
): AlloyProviderEntry => ({
  id: registered.id,
  signalType: registered.provider.signalType,
  config: registered.config,
  enabled: registered.enabled,
});

/** Build Alloy generation input from live signal registries. */
export const snapshotRegistriesForAlloyEffect = (): Effect.Effect<
  AlloyGenerationInput,
  never,
  LogRegistryService | MetricRegistryService | TraceRegistryService | ProfileRegistryService
> =>
  Effect.gen(function* () {
    const logs = yield* LogRegistryService;
    const metrics = yield* MetricRegistryService;
    const traces = yield* TraceRegistryService;
    const profiles = yield* ProfileRegistryService;

    const logEntries = yield* logs.list();
    const metricEntries = yield* metrics.list();
    const traceEntries = yield* traces.list();
    const profileEntries = yield* profiles.list();

    return {
      logs: logEntries.map((entry) => toEntry(entry as RegisteredProvider<LogProvider>)),
      metrics: metricEntries.map((entry) => toEntry(entry as RegisteredProvider<MetricProvider>)),
      traces: traceEntries.map((entry) => toEntry(entry as RegisteredProvider<TraceProvider>)),
      profiles: profileEntries.map((entry) =>
        toEntry(entry as RegisteredProvider<ProfileProvider>)
      ),
    };
  });
