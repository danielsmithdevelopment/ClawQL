import { Data } from "effect";

/** Tagged payment failure for Effect pipelines (audit, gates, entitlements). */
export class PaymentError extends Data.TaggedError("PaymentError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class X402Error extends Data.TaggedError("X402Error")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class EntitlementLimitError extends Data.TaggedError("EntitlementLimitError")<{
  readonly reason: string;
  readonly resource: string;
}> {}
