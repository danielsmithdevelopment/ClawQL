import { Data } from "effect";

export class AuditError extends Data.TaggedError("AuditError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
