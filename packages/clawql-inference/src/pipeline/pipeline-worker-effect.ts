/**
 * Effect-native inference pipeline worker: daemon fiber + spaced poll.
 * Replaces setInterval; keeps advisory-lock tick IO behind tryPromise.
 */

import { Duration, Effect, Fiber, Ref } from "effect";

export type PipelineWorkerTick = () => Promise<void>;

export type PipelineWorkerHandle = {
  readonly stop: () => void;
  readonly fiber: Fiber.RuntimeFiber<never, never>;
};

/**
 * Immediate first tick, then sleep pollMs forever (matches prior setInterval + eager void tick).
 */
export function startPipelineWorkerFiberEffect(
  tick: PipelineWorkerTick,
  pollMs: number
): Effect.Effect<PipelineWorkerHandle> {
  return Effect.gen(function* () {
    const busy = yield* Ref.make(false);

    const maybeTick = Effect.gen(function* () {
      if (yield* Ref.get(busy)) {
        return;
      }
      yield* Ref.set(busy, true);
      yield* Effect.tryPromise({
        try: () => tick(),
        catch: () => undefined as void,
      }).pipe(Effect.ensuring(Ref.set(busy, false)));
    });

    const loop = Effect.forever(
      maybeTick.pipe(Effect.zipRight(Effect.sleep(Duration.millis(pollMs))))
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
