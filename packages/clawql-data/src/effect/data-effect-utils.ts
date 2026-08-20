import { Effect } from "effect";

/** Lift Promise IO into Effect (errors become defects at MCP boundary). */
export function dataFromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, never> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => cause,
  }).pipe(Effect.catchAll((cause) => Effect.die(cause)));
}
