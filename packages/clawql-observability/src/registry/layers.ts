import { Layer } from "effect";

import { makeObservabilityHealthServiceLayer } from "../health/scheduler.js";
import type {
  LogProvider,
  MetricProvider,
  ProfileProvider,
  SignalRegistrySnapshot,
  TraceProvider,
} from "../providers/types.js";
import { LogRegistryService } from "./log-registry.js";
import { MetricRegistryService } from "./metric-registry.js";
import { ProfileRegistryService } from "./profile-registry.js";
import { makeSignalRegistryService } from "./signal-registry-core.js";
import { TraceRegistryService } from "./trace-registry.js";

export const LogRegistryServiceLive = Layer.effect(
  LogRegistryService,
  makeSignalRegistryService<LogProvider>()
);
export const MetricRegistryServiceLive = Layer.effect(
  MetricRegistryService,
  makeSignalRegistryService<MetricProvider>()
);
export const TraceRegistryServiceLive = Layer.effect(
  TraceRegistryService,
  makeSignalRegistryService<TraceProvider>()
);
export const ProfileRegistryServiceLive = Layer.effect(
  ProfileRegistryService,
  makeSignalRegistryService<ProfileProvider>()
);

export const ObservabilityRegistryLive = Layer.mergeAll(
  LogRegistryServiceLive,
  MetricRegistryServiceLive,
  TraceRegistryServiceLive,
  ProfileRegistryServiceLive
);

export const ObservabilityHealthLive = makeObservabilityHealthServiceLayer().pipe(
  Layer.provide(ObservabilityRegistryLive)
);

/** Registry + health services for hosts and tests. */
export const ObservabilityLive = Layer.merge(ObservabilityRegistryLive, ObservabilityHealthLive);

export const createObservabilityRegistryLayer = (input?: {
  readonly log?: SignalRegistrySnapshot<LogProvider>;
  readonly metric?: SignalRegistrySnapshot<MetricProvider>;
  readonly trace?: SignalRegistrySnapshot<TraceProvider>;
  readonly profile?: SignalRegistrySnapshot<ProfileProvider>;
}) =>
  Layer.mergeAll(
    Layer.effect(LogRegistryService, makeSignalRegistryService(input?.log)),
    Layer.effect(MetricRegistryService, makeSignalRegistryService(input?.metric)),
    Layer.effect(TraceRegistryService, makeSignalRegistryService(input?.trace)),
    Layer.effect(ProfileRegistryService, makeSignalRegistryService(input?.profile))
  );
