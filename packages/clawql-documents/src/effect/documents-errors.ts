import { Data } from "effect";

/** Unexpected failure in a documents Effect pipeline (vault I/O, fetch, etc.). */
export class DocumentsError extends Data.TaggedError("DocumentsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
