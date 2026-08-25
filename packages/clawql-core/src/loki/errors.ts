import { Data } from "effect";

export class LokiPushError extends Data.TaggedError("LokiPushError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
