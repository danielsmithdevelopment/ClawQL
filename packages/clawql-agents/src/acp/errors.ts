import { Data } from "effect";

export class AcpError extends Data.TaggedError("AcpError")<{
  readonly reason: string;
  readonly code?: number;
  readonly data?: unknown;
}> {}
