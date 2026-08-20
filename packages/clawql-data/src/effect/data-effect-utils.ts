import { Effect } from "effect";
import { DataError } from "./data-errors.js";

/** Lift a Promise into Effect with {@link DataError} on failure. */
export function dataFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, DataError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new DataError({
        reason: "data async operation failed",
        cause,
      }),
  });
}

/** Lift sync work that may throw into Effect with {@link DataError}. */
export function dataFromSync<A>(tryFn: () => A): Effect.Effect<A, DataError> {
  return Effect.try({
    try: tryFn,
    catch: (cause) =>
      new DataError({
        reason: "data sync operation failed",
        cause,
      }),
  });
}
