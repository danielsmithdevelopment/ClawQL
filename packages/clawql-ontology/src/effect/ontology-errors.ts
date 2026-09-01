import { Data, Effect } from "effect";

export class OntologyError extends Data.TaggedError("OntologyError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Lift a Promise into Effect with {@link OntologyError} on failure. */
export function ontologyFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, OntologyError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new OntologyError({
        reason: "ontology async operation failed",
        cause,
      }),
  });
}

/** Run sync code in Effect. */
export function ontologySync<A>(fn: () => A): Effect.Effect<A> {
  return Effect.sync(fn);
}

export function ontologyFail(reason: string, cause?: unknown): Effect.Effect<never, OntologyError> {
  return Effect.fail(new OntologyError({ reason, cause }));
}
