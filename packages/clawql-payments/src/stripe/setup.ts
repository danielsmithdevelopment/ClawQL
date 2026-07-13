import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  StripeBillingService,
  type StripeSetupInput,
  type StripeSetupResult,
} from "./stripe-billing-service.js";

export type { StripeSetupInput, StripeSetupResult };

export async function setupStripe(
  input: StripeSetupInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<StripeSetupResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const billing = yield* StripeBillingService;
      return yield* billing.setup(input, env);
    }),
    env
  );
}
