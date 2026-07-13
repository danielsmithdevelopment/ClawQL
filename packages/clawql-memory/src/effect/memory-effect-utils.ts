import { Effect } from "effect";
import { MemoryError } from "./memory-errors.js";

/** Lift a Promise into Effect with {@link MemoryError} on failure. */
export function memoryFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, MemoryError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new MemoryError({
        reason: "memory async operation failed",
        cause,
      }),
  });
}

/** Run sync code in Effect. */
export function memorySync<A>(fn: () => A): Effect.Effect<A> {
  return Effect.sync(fn);
}
