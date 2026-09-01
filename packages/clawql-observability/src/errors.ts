import { Data } from "effect";

/** Typed failure for observability config or deploy artifact resolution. */
export class ObservabilityError extends Data.TaggedError("ObservabilityError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
