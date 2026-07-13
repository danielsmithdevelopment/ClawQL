import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  type PortalSessionInput,
} from "./stripe-billing-service.js";

export type { PortalSessionInput };

export async function createCustomerPortalSession(
  input: PortalSessionInput
): Promise<{ url: string; customerId: string }> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createPortalSession(input);
    }),
    input.env
  );
}
