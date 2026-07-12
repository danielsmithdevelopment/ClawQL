import { Data } from "effect";

/** Tagged payment failure for Effect pipelines (audit, gates, entitlements). */
export class PaymentError extends Data.TaggedError("PaymentError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
