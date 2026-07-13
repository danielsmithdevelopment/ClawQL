import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  type StripeSubscriptionInput,
  type StripeSubscriptionResult,
} from "./stripe-billing-service.js";

export type { StripeSubscriptionInput, StripeSubscriptionResult };

export async function createStripeSubscription(
  input: StripeSubscriptionInput
): Promise<StripeSubscriptionResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createSubscription(input);
    }),
    input.env
  );
}
