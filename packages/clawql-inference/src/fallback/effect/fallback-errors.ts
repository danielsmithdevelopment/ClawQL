import { Data } from "effect";

/** All models in a fallback chain failed. */
export class FallbackExhaustedError extends Data.TaggedError("FallbackExhaustedError")<{
  readonly attempted: readonly string[];
  readonly cause: unknown;
}> {}
