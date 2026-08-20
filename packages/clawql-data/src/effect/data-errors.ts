import { Data } from "effect";

export class DataError extends Data.TaggedError("DataError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
