import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  type StripeCustomerInput,
  type StripeCustomerResult,
} from "./stripe-billing-service.js";

export type { StripeCustomerInput, StripeCustomerResult };

export async function createStripeCustomer(
  input: StripeCustomerInput
): Promise<StripeCustomerResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createCustomer(input);
    }),
    input.env
  );
}
