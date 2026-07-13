import { Data } from "effect";

export class StripeNotConfigured extends Data.TaggedError("StripeNotConfigured")<{
  readonly reason?: string;
}> {}

export class StripeSignatureError extends Data.TaggedError("StripeSignatureError")<{
  readonly reason: string;
}> {}

export class StripeApiError extends Data.TaggedError("StripeApiError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}
