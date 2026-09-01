import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";
import {
  logProviderAddedEffect,
  logProviderConfigChangeEffect,
  logProviderRemovedEffect,
  ObservabilityGovernanceSink,
} from "../governance/worm.js";
import type {
  LogProvider,
  MetricProvider,
  ProfileProvider,
  ProviderConfig,
  TraceProvider,
} from "../providers/types.js";
import {
  ObservabilityAuthError,
  requireObservabilityScopeEffect,
  type ObservabilitySessionContext,
} from "../scopes.js";
import { LogRegistryService } from "./log-registry.js";
import { MetricRegistryService } from "./metric-registry.js";
import { ProfileRegistryService } from "./profile-registry.js";
import { TraceRegistryService } from "./trace-registry.js";

type GovernedRegisterInput<TProvider> = {
  readonly session: ObservabilitySessionContext;
  readonly actorId: string;
  readonly provider: TProvider;
  readonly config: ProviderConfig;
};

type GovernedRemoveInput = {
  readonly session: ObservabilitySessionContext;
  readonly actorId: string;
  readonly providerId: string;
};

type GovernedUpdateConfigInput = {
  readonly session: ObservabilitySessionContext;
  readonly actorId: string;
  readonly providerId: string;
  readonly config: ProviderConfig;
  readonly change: Record<string, unknown>;
};

export const registerLogProviderEffect = (
  input: GovernedRegisterInput<LogProvider>
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  LogRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* LogRegistryService;
    yield* registry.register(input.provider, input.config);
    yield* logProviderAddedEffect({
      actorId: input.actorId,
      providerId: input.provider.id,
      signalType: "log",
    });
  });

export const registerMetricProviderEffect = (
  input: GovernedRegisterInput<MetricProvider>
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  MetricRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* MetricRegistryService;
    yield* registry.register(input.provider, input.config);
    yield* logProviderAddedEffect({
      actorId: input.actorId,
      providerId: input.provider.id,
      signalType: "metric",
    });
  });

export const registerTraceProviderEffect = (
  input: GovernedRegisterInput<TraceProvider>
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  TraceRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* TraceRegistryService;
    yield* registry.register(input.provider, input.config);
    yield* logProviderAddedEffect({
      actorId: input.actorId,
      providerId: input.provider.id,
      signalType: "trace",
    });
  });

export const registerProfileProviderEffect = (
  input: GovernedRegisterInput<ProfileProvider>
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  ProfileRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* ProfileRegistryService;
    yield* registry.register(input.provider, input.config);
    yield* logProviderAddedEffect({
      actorId: input.actorId,
      providerId: input.provider.id,
      signalType: "profile",
    });
  });

export const removeLogProviderEffect = (
  input: GovernedRemoveInput
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  LogRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* LogRegistryService;
    yield* registry.remove(input.providerId);
    yield* logProviderRemovedEffect({
      actorId: input.actorId,
      providerId: input.providerId,
      signalType: "log",
    });
  });

export const updateLogProviderConfigEffect = (
  input: GovernedUpdateConfigInput
): Effect.Effect<
  void,
  ObservabilityError | ObservabilityAuthError,
  LogRegistryService | ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");
    const registry = yield* LogRegistryService;
    yield* registry.updateConfig(input.providerId, input.config);
    yield* logProviderConfigChangeEffect({
      actorId: input.actorId,
      providerId: input.providerId,
      signalType: "log",
      change: input.change,
    });
  });
