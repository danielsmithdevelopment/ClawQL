import { Data } from "effect";

/** Unexpected failure in an Ouroboros Effect pipeline. */
export class OuroborosError extends Data.TaggedError("OuroborosError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
