import { Data } from "effect";

/** Typed failure for analytics provider / registry operations. */
export class AnalyticsError extends Data.TaggedError("AnalyticsError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/** Typed failure when an ATR session lacks a required analytics scope. */
export class AnalyticsAuthError extends Data.TaggedError("AnalyticsAuthError")<{
  readonly scope: string;
  readonly reason: string;
}> {}
