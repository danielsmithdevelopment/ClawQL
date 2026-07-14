import { Effect } from "effect";
import { SandboxError } from "./sandbox-errors.js";

/** Lift a Promise into Effect with {@link SandboxError} on failure. */
export function sandboxFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, SandboxError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new SandboxError({
        reason: "sandbox async operation failed",
        cause,
      }),
  });
}
