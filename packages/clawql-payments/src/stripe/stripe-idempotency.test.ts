import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import {
  STRIPE_IDEMPOTENCY_TTL_MS,
  decidePostTtlPaymentIntentAction,
  stripeIdempotencyKeyForAchTopup,
  stripeIdempotencyKeyForAcpComplete,
  stripeIdempotencyKeyForMpp,
  stripeIdempotencyKeyLikelyExpired,
} from "./stripe-idempotency.js";

describe("stripe-idempotency", () => {
  it("derives stable keys from durable ids", () => {
    expect(stripeIdempotencyKeyForAcpComplete("cs_abc")).toBe("clawql-acp-complete:cs_abc");
    expect(stripeIdempotencyKeyForAchTopup("top_1")).toBe("clawql-ach-topup:top_1");
    expect(stripeIdempotencyKeyForMpp("chal_1")).toBe("clawql-mpp:chal_1");
    expect(stripeIdempotencyKeyForAcpComplete("  cs_abc  ")).toBe("clawql-acp-complete:cs_abc");
  });

  it("treats keys older than ~24h as expired", () => {
    const now = Date.parse("2026-11-03T12:00:00.000Z");
    const fresh = new Date(now - STRIPE_IDEMPOTENCY_TTL_MS + 60_000).toISOString();
    const stale = new Date(now - STRIPE_IDEMPOTENCY_TTL_MS - 1).toISOString();
    expect(stripeIdempotencyKeyLikelyExpired(fresh, now)).toBe(false);
    expect(stripeIdempotencyKeyLikelyExpired(stale, now)).toBe(true);
    expect(stripeIdempotencyKeyLikelyExpired("not-a-date", now)).toBe(true);
  });

  it("fail-closes when metadata search is unavailable after TTL", () => {
    const closed = decidePostTtlPaymentIntentAction({
      status: "search_unavailable",
      cause: new Error("search disabled"),
    });
    expect(closed.action).toBe("fail_closed");
    if (closed.action === "fail_closed") {
      expect(closed.reason).toMatch(/refusing to create a second charge/);
    }
  });

  it("reuses found PI and allows create only on definitive not_found", () => {
    const intent = { id: "pi_1" } as Stripe.PaymentIntent;
    expect(decidePostTtlPaymentIntentAction({ status: "found", intent })).toEqual({
      action: "reuse",
      intent,
    });
    expect(decidePostTtlPaymentIntentAction({ status: "not_found" })).toEqual({
      action: "create",
    });
  });
});
