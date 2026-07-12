import { describe, expect, it } from "vitest";
import { isStripeConfigured, resolveStripeSecretKey } from "./client.js";
import { StripeNotConfiguredError } from "./errors.js";

describe("stripe client", () => {
  it("detects configured secret key", () => {
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: "sk_test_abc" })).toBe(true);
    expect(isStripeConfigured({})).toBe(false);
  });

  it("throws when secret key is missing", () => {
    expect(() => resolveStripeSecretKey({})).toThrow(StripeNotConfiguredError);
  });
});
