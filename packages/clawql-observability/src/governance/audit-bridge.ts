import { appendProcessWormEffect, type WORMAppendInput } from "clawql-audit";
import { Effect, Layer } from "effect";

import { ObservabilityGovernanceSink, type ObservabilityGovernanceEvent } from "./worm.js";

/** Map observability governance events to process WORM append input. */
export const wormInputFromObservabilityGovernanceEvent = (
  event: ObservabilityGovernanceEvent
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => ({
    type: event.type,
    timestamp: event.timestamp,
    sessionId: event.actorId,
    metadata: {
      source: "observability",
      signalType: event.signalType,
      providerId: event.providerId,
      change: event.change,
      detail: event.detail,
    },
  }));

const appendObservabilityGovernanceToProcessWorm = (
  event: ObservabilityGovernanceEvent
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const input = yield* wormInputFromObservabilityGovernanceEvent(event);
    yield* appendProcessWormEffect(input);
  }).pipe(
    Effect.asVoid,
    Effect.catchAll(() => Effect.void)
  );

/**
 * Live governance sink that dual-writes to the process WORM trail when booted.
 * Best-effort — never fails observability callers (mirrors clawql-audit append semantics).
 */
export const ObservabilityGovernanceSinkLiveFromProcessWorm = Layer.succeed(
  ObservabilityGovernanceSink,
  {
    append: appendObservabilityGovernanceToProcessWorm,
  }
);

/** Resolve governance sink Layer from env (`CLAWQL_WORM_ENABLED=1` → process WORM bridge). */
export const resolveObservabilityGovernanceSinkLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<ObservabilityGovernanceSink> =>
  env.CLAWQL_WORM_ENABLED?.trim() === "1"
    ? ObservabilityGovernanceSinkLiveFromProcessWorm
    : Layer.succeed(ObservabilityGovernanceSink, {
        append: () => Effect.void,
      });
