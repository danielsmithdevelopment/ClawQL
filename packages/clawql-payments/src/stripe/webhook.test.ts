import Stripe from "stripe";
import { describe, expect, it, beforeEach } from "vitest";
import { resetDefaultAuditRingBufferForTests } from "clawql-core";
import {
  assertStripeWebhookSignature,
  processStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "./webhook.js";
import { StripeWebhookVerificationError } from "./errors.js";
import { listPaymentAuditEntries, resetPaymentAuditStoreForTests } from "../audit/worm.js";

describe("stripe webhook verification", () => {
  beforeEach(() => {
    resetDefaultAuditRingBufferForTests();
    resetPaymentAuditStoreForTests();
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
    const result = await processStripeWebhookEvent(event, { tenantId: "default" });
    expect(result.handled).toBe(true);
    const entries = listPaymentAuditEntries(10);
    expect(entries.some((e) => e.action === "STRIPE_INVOICE_PAID")).toBe(true);
  });
});
