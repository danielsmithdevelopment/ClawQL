import { describe, expect, it } from "vitest";
import { appendFinanceOffers, financeProvidersFromEnv } from "./providers.js";

describe("financeProvidersFromEnv", () => {
  it("parses comma-separated provider list", () => {
    expect(financeProvidersFromEnv({ CLAWQL_MPP_FINANCE_PROVIDERS: "paypal, adyen" })).toEqual([
      "paypal",
      "adyen",
    ]);
  });
});

describe("appendFinanceOffers", () => {
  it("adds configured finance providers without duplicating stripe/x402", () => {
    const offers = appendFinanceOffers({
      offers: [
        { intent: "charge", method: "x402", amount: "1000", currency: "usdc" },
        { intent: "charge", method: "stripe", amount: null, currency: "usd" },
      ],
      env: { CLAWQL_MPP_FINANCE_PROVIDERS: "paypal,square" },
      resource: "/v1/test",
    });
    expect(offers.map((o) => o.method)).toEqual(["x402", "stripe", "paypal", "square"]);
  });
});
