import Stripe from "stripe";
import { Effect } from "effect";
import { describe, expect, it, beforeEach } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import {
  assertStripeWebhookSignature,
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "./webhook.js";
import { StripeWebhookVerificationError } from "./errors.js";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";
import { resetPaymentsEffectRuntimeForTests } from "../runtime/payments-effect-runtime.js";
import {
  StripeWebhookService,
  verifyStripeWebhookSignature as verifyFromService,
} from "./stripe-webhook-service.js";
import { paymentsServicesLiveLayer } from "../runtime/payments-effect-runtime.js";

describe("stripe webhook verification", () => {
  beforeEach(async () => {
    resetDefaultAuditRingBufferForTests();
    await resetPaymentAuditStoreForTests();
    resetPaymentsEffectRuntimeForTests();
  });

  const secret = "whsec_test_secret_for_clawql_payments";
  const payload = JSON.stringify({
    id: "evt_test_webhook",
    object: "event",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_test",
        object: "invoice",
        amount_paid: 5000,
        metadata: { tenant_id: "tenant-a" },
      },
    },
  });

  it("verifies a valid Stripe-Signature", () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const result = verifyStripeWebhookSignature(payload, signature, secret);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.type).toBe("invoice.paid");
    }
  });

  it("rejects an invalid signature", () => {
    const result = verifyStripeWebhookSignature(payload, "t=0,v1=invalid", secret);
    expect(result.ok).toBe(false);
  });

  it("assertStripeWebhookSignature throws on invalid signature", () => {
    expect(() => assertStripeWebhookSignature(payload, "bad", secret)).toThrow(
      StripeWebhookVerificationError
    );
  });

  it("processes invoice.paid into payment audit trail", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = assertStripeWebhookSignature(payload, signature, secret);
    const result = await processStripeWebhookEvent(event, {
      tenantId: "default",
      env: { CLAWQL_PAYMENTS_AUDIT_STORE: "memory" },
    });
    expect(result.handled).toBe(true);
    const entries = await listPaymentAuditEntries(10);
    expect(entries.some((e) => e.action === "STRIPE_INVOICE_PAID")).toBe(true);
  });

  it("processes invoice.payment_failed with dunning classifier fields", async () => {
    const failPayload = JSON.stringify({
      id: "evt_test_fail",
      object: "event",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail",
          object: "invoice",
          amount_due: 2900,
          attempt_count: 2,
          next_payment_attempt: 1_700_000_000,
          billing_reason: "subscription_cycle",
          customer: "cus_fail",
          subscription: "sub_fail",
          hosted_invoice_url: "https://invoice.stripe.com/i/test",
          metadata: { tenant_id: "tenant-fail" },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: failPayload,
      secret,
    });
    const event = assertStripeWebhookSignature(failPayload, signature, secret);
    const result = await processStripeWebhookEvent(event, {
      tenantId: "default",
      env: { CLAWQL_PAYMENTS_AUDIT_STORE: "memory" },
    });
    expect(result.handled).toBe(true);
    const entries = await listPaymentAuditEntries(20);
    const failed = entries.find((e) => e.action === "STRIPE_PAYMENT_FAILED");
    expect(failed).toBeTruthy();
    expect(failed?.payload.dunning_stage).toBe("retrying");
    expect(failed?.payload.billing_reason).toBe("subscription_cycle");
    expect(failed?.payload.attempt_count).toBe(2);
    expect(failed?.payload.subscription_id).toBe("sub_fail");
    expect(failed?.payload.is_proration).toBe(false);
  });

  it("audits subscription past_due transitions", async () => {
    const subPayload = JSON.stringify({
      id: "evt_test_past_due",
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_past",
          object: "subscription",
          status: "past_due",
          customer: "cus_past",
          metadata: { tenant_id: "tenant-past" },
        },
        previous_attributes: { status: "active" },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: subPayload,
      secret,
    });
    const event = assertStripeWebhookSignature(subPayload, signature, secret);
    const result = await processStripeWebhookEvent(event, {
      tenantId: "default",
      env: { CLAWQL_PAYMENTS_AUDIT_STORE: "memory" },
    });
    expect(result.handled).toBe(true);
    const entries = await listPaymentAuditEntries(20);
    expect(entries.some((e) => e.action === "STRIPE_SUBSCRIPTION_PAST_DUE")).toBe(true);
  });

  it("StripeWebhookService verifySignature returns Effect for valid payload", async () => {
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = await Effect.runPromise(
      Effect.gen(function* () {
        const webhook = yield* StripeWebhookService;
        return yield* webhook.verifySignature(payload, signature, secret);
      }).pipe(Effect.provide(paymentsServicesLiveLayer({ CLAWQL_PAYMENTS_AUDIT_STORE: "memory" })))
    );
    expect(event.type).toBe("invoice.paid");
    expect(verifyFromService(payload, signature, secret).ok).toBe(true);
  });
});
