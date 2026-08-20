import { Data } from "effect";

/** Unexpected failure in a clawql-data Effect pipeline. */
export class DataError extends Data.TaggedError("DataError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
