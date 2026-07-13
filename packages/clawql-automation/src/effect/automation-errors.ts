import { Data } from "effect";

/** Unexpected failure in an automation Effect pipeline. */
export class AutomationError extends Data.TaggedError("AutomationError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
