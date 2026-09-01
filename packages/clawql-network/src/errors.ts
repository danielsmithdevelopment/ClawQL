import { Data } from "effect";

export class NetworkNotImplementedError extends Data.TaggedError("NetworkNotImplementedError")<{
  readonly operation: string;
  readonly message: string;
}> {}
