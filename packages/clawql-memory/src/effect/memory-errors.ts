import { Data } from "effect";

/** Unexpected failure in a memory Effect pipeline (vault I/O, db sync, etc.). */
export class MemoryError extends Data.TaggedError("MemoryError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
