import { Data } from "effect";

/** Tagged failure for MPP credential verification (HTTP 402 / MCP -32043). */
export class MppVerificationError extends Data.TaggedError("MppVerificationError")<{
  readonly reason: string;
  readonly method?: string;
  readonly code?: number;
  readonly cause?: unknown;
}> {}
