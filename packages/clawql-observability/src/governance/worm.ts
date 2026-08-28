import { Context, Effect, Layer } from "effect";

export type ObservabilityWormEntryType =
  | "OBSERVABILITY_PROVIDER_ADDED"
  | "OBSERVABILITY_PROVIDER_REMOVED"
  | "OBSERVABILITY_PROVIDER_CONFIG_CHANGED"
  | "OBSERVABILITY_ALLOY_CONFIG_APPLIED"
  | "OBSERVABILITY_RAW_DATA_ACCESSED"
  | "OBSERVABILITY_EXPORT_REQUESTED";

export type ObservabilityGovernanceEvent = {
  readonly type: ObservabilityWormEntryType;
  readonly actorId: string;
  readonly timestamp: string;
  readonly signalType?: "log" | "metric" | "trace" | "profile";
  readonly providerId?: string;
  readonly change?: Record<string, unknown>;
  readonly detail?: Record<string, unknown>;
};

export class ObservabilityGovernanceSink extends Context.Tag("clawql/ObservabilityGovernanceSink")<
  ObservabilityGovernanceSink,
  {
    readonly append: (event: ObservabilityGovernanceEvent) => Effect.Effect<void>;
  }
>() {}

export const ObservabilityGovernanceSinkLive = Layer.succeed(ObservabilityGovernanceSink, {
  append: () => Effect.void,
});

const nowIso = (): string => new Date().toISOString();

const appendGovernanceEventEffect = (
  event: ObservabilityGovernanceEvent
): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  Effect.gen(function* () {
    const sink = yield* ObservabilityGovernanceSink;
    yield* sink.append(event);
  });

export const logProviderAddedEffect = (input: {
  readonly actorId: string;
  readonly providerId: string;
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_PROVIDER_ADDED",
    actorId: input.actorId,
    providerId: input.providerId,
    signalType: input.signalType,
    timestamp: input.timestamp ?? nowIso(),
  });

export const logProviderRemovedEffect = (input: {
  readonly actorId: string;
  readonly providerId: string;
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_PROVIDER_REMOVED",
    actorId: input.actorId,
    providerId: input.providerId,
    signalType: input.signalType,
    timestamp: input.timestamp ?? nowIso(),
  });

export const logProviderConfigChangeEffect = (input: {
  readonly actorId: string;
  readonly providerId: string;
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly change: Record<string, unknown>;
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_PROVIDER_CONFIG_CHANGED",
    actorId: input.actorId,
    providerId: input.providerId,
    signalType: input.signalType,
    change: input.change,
    timestamp: input.timestamp ?? nowIso(),
  });

export const logAlloyConfigAppliedEffect = (input: {
  readonly actorId: string;
  readonly detail?: Record<string, unknown>;
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_ALLOY_CONFIG_APPLIED",
    actorId: input.actorId,
    detail: input.detail,
    timestamp: input.timestamp ?? nowIso(),
  });

export const logRawDataAccessedEffect = (input: {
  readonly actorId: string;
  readonly providerId: string;
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly detail?: Record<string, unknown>;
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_RAW_DATA_ACCESSED",
    actorId: input.actorId,
    providerId: input.providerId,
    signalType: input.signalType,
    detail: input.detail,
    timestamp: input.timestamp ?? nowIso(),
  });

export const logExportRequestedEffect = (input: {
  readonly actorId: string;
  readonly providerId: string;
  readonly signalType: "log" | "metric" | "trace" | "profile";
  readonly detail?: Record<string, unknown>;
  readonly timestamp?: string;
}): Effect.Effect<void, never, ObservabilityGovernanceSink> =>
  appendGovernanceEventEffect({
    type: "OBSERVABILITY_EXPORT_REQUESTED",
    actorId: input.actorId,
    providerId: input.providerId,
    signalType: input.signalType,
    detail: input.detail,
    timestamp: input.timestamp ?? nowIso(),
  });
