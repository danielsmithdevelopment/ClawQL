import { describe, expect, it } from "vitest";
import {
  STRIPE_IDEMPOTENCY_TTL_MS,
  stripeIdempotencyKeyForAchTopup,
  stripeIdempotencyKeyForAcpComplete,
  stripeIdempotencyKeyLikelyExpired,
} from "./stripe-idempotency.js";

describe("stripe-idempotency", () => {
  it("derives stable keys from durable ids", () => {
    expect(stripeIdempotencyKeyForAcpComplete("cs_abc")).toBe("clawql-acp-complete:cs_abc");
    expect(stripeIdempotencyKeyForAchTopup("top_1")).toBe("clawql-ach-topup:top_1");
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
});
