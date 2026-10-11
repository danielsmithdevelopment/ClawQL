import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  buildCheckoutSessionMetadata,
  buildCheckoutSessionMetadataWithVerifiedUser,
  createCheckoutSessionWithVerifiedUserEffect,
  type CheckoutBillingMode,
  type CheckoutSessionInput,
  type CheckoutSessionPlan,
  type CheckoutSessionResult,
  type CheckoutSessionVerifiedInput,
} from "./stripe-billing-service.js";

export type {
  CheckoutBillingMode,
  CheckoutSessionInput,
  CheckoutSessionPlan,
  CheckoutSessionResult,
  CheckoutSessionVerifiedInput,
};
export {
  buildCheckoutSessionMetadata,
  buildCheckoutSessionMetadataWithVerifiedUser,
  createCheckoutSessionWithVerifiedUserEffect,
};

export async function createStripeCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  // Raw supabaseUserId on public HTTP must never bind clawql_supabase_user_id —
  // strip it so createCheckoutSession cannot set that metadata.
  const { supabaseUserId: _ignored, ...safe } = input;
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createCheckoutSession(safe);
    }),
    input.env
  );
}
