import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { classifyFailedInvoiceEffect, classifySubscriptionTransitionEffect } from "./dunning.js";

describe("stripe dunning / proration classifier", () => {
  it("marks subscription_update invoices as proration-shaped", async () => {
    const signal = await Effect.runPromise(
      classifyFailedInvoiceEffect({
        id: "in_prorate",
        billing_reason: "subscription_update",
        attempt_count: 1,
        next_payment_attempt: 1_700_000_000,
        amount_due: 1234,
        customer: "cus_1",
        subscription: "sub_1",
      })
    );
    expect(signal.isProration).toBe(true);
    expect(signal.billingReason).toBe("subscription_update");
    expect(signal.stage).toBe("first_failure");
    expect(signal.amountDueUsd).toBe(12.34);
  });

  it("marks cycle invoices as non-proration and retrying when attempt>1", async () => {
    const signal = await Effect.runPromise(
      classifyFailedInvoiceEffect({
        id: "in_cycle",
        billing_reason: "subscription_cycle",
        attempt_count: 3,
        next_payment_attempt: 1_700_000_100,
        amount_due: 2900,
      })
    );
    expect(signal.isProration).toBe(false);
    expect(signal.stage).toBe("retrying");
  });

  it("marks exhausted when Stripe will not retry", async () => {
    const signal = await Effect.runPromise(
      classifyFailedInvoiceEffect({
        id: "in_done",
        billing_reason: "subscription_cycle",
        attempt_count: 4,
        next_payment_attempt: null,
        amount_due: 2900,
        lines: { data: [{ proration: false }] },
      })
    );
    expect(signal.stage).toBe("exhausted");
  });

  it("emits past_due / unpaid / recovered subscription transitions", async () => {
    const pastDue = await Effect.runPromise(
      classifySubscriptionTransitionEffect({
        previousStatus: "active",
        subscription: { id: "sub_x", status: "past_due", customer: "cus_x" },
      })
    );
    expect(pastDue?.stage).toBe("past_due");

    const recovered = await Effect.runPromise(
      classifySubscriptionTransitionEffect({
        previousStatus: "past_due",
        subscription: { id: "sub_x", status: "active", customer: "cus_x" },
      })
    );
    expect(recovered?.stage).toBe("recovered");

    const noise = await Effect.runPromise(
      classifySubscriptionTransitionEffect({
        previousStatus: "active",
        subscription: { id: "sub_x", status: "active" },
      })
    );
    expect(noise).toBeNull();
  });
});
