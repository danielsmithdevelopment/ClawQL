import { Effect } from "effect";
import { DocumentsError } from "./documents-errors.js";

/** Lift a Promise into Effect with {@link DocumentsError} on failure. */
export function documentsFromPromise<A>(tryFn: () => Promise<A>): Effect.Effect<A, DocumentsError> {
  return Effect.tryPromise({
    try: tryFn,
    catch: (cause) =>
      new DocumentsError({
        reason: "documents async operation failed",
        cause,
      }),
  });
}

/** Run sync code in Effect. */
export function documentsSync<A>(fn: () => A): Effect.Effect<A> {
  return Effect.sync(fn);
}
