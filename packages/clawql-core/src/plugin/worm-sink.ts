/**
 * In-memory WORM audit sink for tests and lightweight hosts.
 */

import { Effect, Layer, Ref } from "effect";
import { WormAuditSink, type WormAuditEvent } from "./provider-types.js";

export const InMemoryWormAuditSinkLive: Layer.Layer<WormAuditSink> = Layer.effect(
  WormAuditSink,
  Effect.gen(function* () {
    const ref = yield* Ref.make<WormAuditEvent[]>([]);
    return {
      append: (event) => Ref.update(ref, (xs) => [...xs, event]),
    };
  })
);

/** Test helper: Layer that also exposes a reader via Ref — use captureWormEvents in tests instead. */
export function makeCapturingWormLayer(): {
  readonly layer: Layer.Layer<WormAuditSink>;
  readonly events: () => Effect.Effect<readonly WormAuditEvent[], never>;
} {
  const state = { events: [] as WormAuditEvent[] };
  const layer = Layer.succeed(WormAuditSink, {
    append: (event) =>
      Effect.sync(() => {
        state.events.push(event);
      }),
  });
  return {
    layer,
    events: () => Effect.sync(() => state.events),
  };
}
