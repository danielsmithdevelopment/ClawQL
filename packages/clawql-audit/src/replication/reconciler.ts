/**
 * Background outbox reconciler — drains remote replication on an interval.
 */

import { Effect } from "effect";
import type { AuditError } from "../errors.js";
import type { DualAckReplicator } from "./dual-ack.js";

export type ReconcilerHandle = {
  readonly stop: () => Effect.Effect<void>;
};

export const startOutboxReconciler = (
  replicator: DualAckReplicator,
  intervalMs: number
): Effect.Effect<ReconcilerHandle> =>
  Effect.sync(() => {
    const timer = setInterval(() => {
      void Effect.runPromise(replicator.drainOutbox().pipe(Effect.catchAll(() => Effect.void)));
    }, intervalMs);
    // Do not keep the process alive solely for the reconciler.
    timer.unref?.();
    return {
      stop: () =>
        Effect.sync(() => {
          clearInterval(timer);
        }),
    };
  });

export type { AuditError };
