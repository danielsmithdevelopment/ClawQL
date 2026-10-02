import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  buildCheckoutSessionMetadata,
  type CheckoutBillingMode,
  type CheckoutSessionInput,
  type CheckoutSessionPlan,
  type CheckoutSessionResult,
} from "./stripe-billing-service.js";

export type {
  CheckoutBillingMode,
  CheckoutSessionInput,
  CheckoutSessionPlan,
  CheckoutSessionResult,
};
export { buildCheckoutSessionMetadata };

export async function createStripeCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createCheckoutSession(input);
    }),
    input.env
  );
}
