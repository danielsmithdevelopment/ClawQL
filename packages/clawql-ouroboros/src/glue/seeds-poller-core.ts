/**
 * Effect-native seeds poller: spaced ticks + skip-if-busy {@link Ref},
 * forked as a daemon fiber (interruptible). Replaces `setInterval`.
 */

import { Cause, Duration, Effect, Fiber, Ref } from "effect";
import type { Seed } from "../seed.js";

export interface SeedPollerOptions {
  pollIntervalMs?: number;
  onError?: (seed: Seed, error: unknown) => void | Promise<void>;
}

export type SeedRunFn = (seed: Seed) => Promise<void>;

/** Seed runner Effect — failures are soft-caught per seed in the tick. */
export type SeedRunEffect = (seed: Seed) => Effect.Effect<void, unknown>;

function asUnknownError(cause: Cause.Cause<unknown>): unknown {
  return Cause.squash(cause);
}

/** One poll cycle: fetch pending seeds and run each (soft-fail → markFailed / onError). */
export function seedsPollTickEffect(
  run: SeedRunEffect,
  fetchPending: Effect.Effect<Seed[], unknown>,
  markFailed: (seedId: string, error: unknown) => Effect.Effect<void, unknown>,
  onError?: (seed: Seed, error: unknown) => Effect.Effect<void, unknown>
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const pending = yield* fetchPending.pipe(Effect.orDie);
    for (const seed of pending) {
      yield* run(seed).pipe(
        Effect.catchAllCause((cause) =>
          Effect.gen(function* () {
            const err = asUnknownError(cause);
            yield* markFailed(seed.metadata.seed_id, err).pipe(Effect.orDie);
            if (onError) {
              yield* onError(seed, err).pipe(Effect.orDie);
            }
          })
        )
      );
    }
  });
}

export type SeedsPollerHandle = {
  readonly stop: () => void;
  readonly fiber: Fiber.RuntimeFiber<never, never>;
};

/**
 * Daemon fiber: sleep `pollIntervalMs` → tick (skip if busy) → forever.
 * Matches prior setInterval + skip-mutex semantics (first tick after first interval).
 */
export function startSeedsPollerFiberEffect(
  run: SeedRunEffect,
  fetchPending: Effect.Effect<Seed[], unknown>,
  markFailed: (seedId: string, error: unknown) => Effect.Effect<void, unknown>,
  options: SeedPollerOptions = {}
): Effect.Effect<SeedsPollerHandle> {
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const onErrorEffect = options.onError
    ? (seed: Seed, error: unknown) =>
        Effect.tryPromise({
          try: async () => {
            await options.onError?.(seed, error);
          },
          catch: () => undefined as void,
        }).pipe(Effect.asVoid)
    : undefined;

  return Effect.gen(function* () {
    const busy = yield* Ref.make(false);

    const maybeTick = Effect.gen(function* () {
      if (yield* Ref.get(busy)) {
        return;
      }
      yield* Ref.set(busy, true);
      yield* seedsPollTickEffect(run, fetchPending, markFailed, onErrorEffect).pipe(
        Effect.ensuring(Ref.set(busy, false))
      );
    });

    const loop = Effect.forever(
      Effect.sleep(Duration.millis(pollIntervalMs)).pipe(Effect.zipRight(maybeTick))
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

function promiseAsEffect<A>(tryFn: () => Promise<A>): Effect.Effect<A, unknown> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/**
 * Promise façade (same shape as the historical setInterval helper).
 * Prefer {@link startSeedsPollerFiberEffect} inside Effect programs.
 */
export function startSeedsPollerCore(
  run: SeedRunFn,
  fetchPending: () => Promise<Seed[]>,
  markFailed: (seedId: string, error: unknown) => Promise<void>,
  options: SeedPollerOptions = {}
): { stop: () => void } {
  const handle = Effect.runSync(
    startSeedsPollerFiberEffect(
      (seed) => promiseAsEffect(() => run(seed)),
      promiseAsEffect(() => fetchPending()),
      (seedId, error) => promiseAsEffect(() => markFailed(seedId, error)),
      options
    )
  );
  return { stop: handle.stop };
}
