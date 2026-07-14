import { Data } from "effect";

/** Unexpected failure in a sandbox Effect pipeline. */
export class SandboxError extends Data.TaggedError("SandboxError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
