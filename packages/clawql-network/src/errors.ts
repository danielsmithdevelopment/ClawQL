import { Data } from "effect";

export class NetworkNotImplementedError extends Data.TaggedError("NetworkNotImplementedError")<{
  readonly operation: string;
  readonly message: string;
}> {}

export class NetworkBinaryNotFoundError extends Data.TaggedError("NetworkBinaryNotFoundError")<{
  readonly binary: string;
  readonly message: string;
}> {}

export class NetworkCommandError extends Data.TaggedError("NetworkCommandError")<{
  readonly command: string;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly message: string;
}> {}
