import { Effect } from "effect";
import { OuroborosError } from "./ouroboros-errors.js";

/** Lift a Promise into Effect with {@link OuroborosError} on failure. */
export function ouroborosFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, OuroborosError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new OuroborosError({
        reason: "ouroboros async operation failed",
        cause,
      }),
  });
}
