import Stripe from "stripe";
import {
  appendPaymentWormEntry,
  buildPaymentWormEntry,
  buildStripeInvoicePaidEntry,
} from "../audit/index.js";
import { loadPaymentsConfig } from "../config/store.js";
import { StripeWebhookVerificationError } from "./errors.js";

export type StripeWebhookEvent = {
  id: string;
  type: string;
  payload: Stripe.Event;
};

export type StripeWebhookVerifyResult =
  { ok: true; event: Stripe.Event } | { ok: false; reason: string };

export function verifyStripeWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): StripeWebhookVerifyResult {
  if (!secret.trim()) {
    return { ok: false, reason: "webhook secret is required" };
  }
  if (!signature.trim()) {
    return { ok: false, reason: "Stripe-Signature header is required" };
  }

  try {
    const event = Stripe.webhooks.constructEvent(payload, signature, secret);
    return { ok: true, event };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  }
}

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

export type ProcessStripeWebhookOptions = {
  tenantId?: string;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
};

export type ProcessStripeWebhookResult = {
  handled: boolean;
  eventType: string;
  eventId: string;
};

function tenantFromEvent(event: Stripe.Event, fallbackTenantId: string): string {
  const object = event.data.object as { metadata?: Record<string, string> };
  return object.metadata?.tenant_id?.trim() || fallbackTenantId;
}

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  options: ProcessStripeWebhookOptions = {}
): Promise<ProcessStripeWebhookResult> {
  const env = options.env ?? process.env;
  const config = await loadPaymentsConfig(env);
  const tenantId = options.tenantId ?? config.tenantId ?? "default";

  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const amountUsd = (invoice.amount_paid ?? 0) / 100;
      await appendPaymentWormEntry(
        buildStripeInvoicePaidEntry({
          tenantId: tenantFromEvent(event, tenantId),
          amountUsd,
          plan: config.plan,
          correlationId: options.correlationId ?? event.id,
        })
      );
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await appendPaymentWormEntry(
        buildPaymentWormEntry({
          eventKind: "STRIPE_PAYMENT_FAILED",
          summary: `Stripe invoice payment failed for ${invoice.id}`,
          correlationId: options.correlationId ?? event.id,
          payload: {
            provider: "stripe",
            amount_usd: (invoice.amount_due ?? 0) / 100,
            tenant_id: tenantFromEvent(event, tenantId),
            plan: config.plan,
          },
        })
      );
      break;
    }
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      await appendPaymentWormEntry(
        buildPaymentWormEntry({
          eventKind: "STRIPE_SUBSCRIPTION_CREATED",
          summary: `Stripe subscription created ${subscription.id}`,
          correlationId: options.correlationId ?? event.id,
          payload: {
            provider: "stripe",
            tenant_id: tenantFromEvent(event, tenantId),
            plan: config.plan,
          },
        })
      );
      break;
    }
    default:
      return {
        handled: false,
        eventType: event.type,
        eventId: event.id,
      };
  }

  return {
    handled: true,
    eventType: event.type,
    eventId: event.id,
  };
}

export async function verifyAndProcessStripeWebhook(input: {
  payload: string | Buffer;
  signature: string;
  secret: string;
  tenantId?: string;
  correlationId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<ProcessStripeWebhookResult> {
  const event = assertStripeWebhookSignature(input.payload, input.signature, input.secret);
  return processStripeWebhookEvent(event, {
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    env: input.env,
  });
}
