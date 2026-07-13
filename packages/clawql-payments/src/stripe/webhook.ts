import { Effect } from "effect";
import Stripe from "stripe";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import { StripeWebhookVerificationError } from "./errors.js";
import {
  StripeWebhookService,
  verifyStripeWebhookSignature,
  type ProcessStripeWebhookOptions,
  type ProcessStripeWebhookResult,
  type StripeWebhookVerifyResult,
} from "./stripe-webhook-service.js";

export type StripeWebhookEvent = {
  id: string;
  type: string;
  payload: Stripe.Event;
};

export type { ProcessStripeWebhookOptions, ProcessStripeWebhookResult, StripeWebhookVerifyResult };

export { verifyStripeWebhookSignature };

export function assertStripeWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  const result = verifyStripeWebhookSignature(payload, signature, secret);
  if (!result.ok) {
    throw new StripeWebhookVerificationError(result.reason);
  }
  return result.event;
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  options: ProcessStripeWebhookOptions = {}
): Promise<ProcessStripeWebhookResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const webhook = yield* StripeWebhookService;
      return yield* webhook.processEvent(event, options);
    }),
    options.env
  );
}

export async function verifyAndProcessStripeWebhook(input: {
  payload: string | Buffer;
  signature: string;
  secret: string;
  tenantId?: string;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ProcessStripeWebhookResult> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const webhook = yield* StripeWebhookService;
      return yield* webhook.verifyAndProcess(input);
    }),
    input.env
  );
}
