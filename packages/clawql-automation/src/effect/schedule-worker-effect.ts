/**
 * Effect-native schedule worker: daemon fiber + skip-if-busy Ref.
 * Replaces setInterval in {@link startScheduleWorker}.
 */

import { Cause, Duration, Effect, Fiber, Ref } from "effect";
import { AutomationError } from "./automation-errors.js";
import { automationFromPromise } from "./automation-effect-utils.js";

export type ScheduleWorkerTick = () => Promise<number>;

export type ScheduleWorkerHandle = {
  readonly stop: () => void;
  readonly fiber: Fiber.RuntimeFiber<never, never>;
};

/**
 * Fork a daemon loop: sleep pollMs → tick (skip if busy) → forever.
 * First tick fires after the first interval (same as setInterval).
 */
export function startScheduleWorkerFiberEffect(
  tick: ScheduleWorkerTick,
  pollMs: number,
  onTickError?: (message: string) => void
): Effect.Effect<ScheduleWorkerHandle> {
  return Effect.gen(function* () {
    const busy = yield* Ref.make(false);

    const maybeTick = Effect.gen(function* () {
      if (yield* Ref.get(busy)) {
        return;
      }
      yield* Ref.set(busy, true);
      yield* automationFromPromise(() => tick()).pipe(
        Effect.catchAllCause((cause) =>
          Effect.sync(() => {
            const squashed = Cause.squash(cause);
            let msg: string;
            if (squashed instanceof AutomationError) {
              const nested = squashed.cause;
              msg =
                nested instanceof Error
                  ? nested.message
                  : nested != null
                    ? String(nested)
                    : squashed.reason;
            } else if (squashed instanceof Error) {
              msg = squashed.message;
            } else {
              msg = String(squashed);
            }
            (onTickError ?? ((m) => console.error(`[clawql-schedule] worker tick failed: ${m}`)))(
              msg
            );
          })
        ),
        Effect.ensuring(Ref.set(busy, false))
      );
    });

    const loop = Effect.forever(
      Effect.sleep(Duration.millis(pollMs)).pipe(Effect.zipRight(maybeTick))
    );
    const fiber = yield* Effect.forkDaemon(loop);
    return {
      fiber,
      stop: () => {
        Effect.runFork(Fiber.interrupt(fiber));
      },
    };
  });
}
