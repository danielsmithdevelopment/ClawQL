import { Data } from "effect";

export class WormChainGapError extends Data.TaggedError("WormChainGapError")<{
  readonly expected: number;
  readonly got: number;
}> {}

export class WormStorageError extends Data.TaggedError("WormStorageError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
