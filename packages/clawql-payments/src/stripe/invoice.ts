import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  type StripeInvoiceInput,
  type StripeInvoiceResult,
} from "./stripe-billing-service.js";

export type { StripeInvoiceInput, StripeInvoiceResult };

export async function createStripeInvoice(input: StripeInvoiceInput): Promise<StripeInvoiceResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.createInvoice(input);
    }),
    input.env
  );
}
