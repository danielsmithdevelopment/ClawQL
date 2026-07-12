import { describe, expect, it } from "vitest";
import { isPaymentAuditLokiPushEnabled } from "./store.js";

describe("isPaymentAuditLokiPushEnabled", () => {
  it("defaults on when Loki URL is set", () => {
    expect(
      isPaymentAuditLokiPushEnabled({
        CLAWQL_LOKI_PUSH_URL: "https://loki.example/push",
      })
    ).toBe(true);
  });

  it("respects CLAWQL_PAYMENTS_LOKI_PUSH=0", () => {
    expect(
      isPaymentAuditLokiPushEnabled({
        CLAWQL_LOKI_PUSH_URL: "https://loki.example/push",
        CLAWQL_PAYMENTS_LOKI_PUSH: "0",
      })
    ).toBe(false);
  });

  it("respects global CLAWQL_ENABLE_LOKI_PUSH=0", () => {
    expect(
      isPaymentAuditLokiPushEnabled({
        CLAWQL_LOKI_PUSH_URL: "https://loki.example/push",
        CLAWQL_ENABLE_LOKI_PUSH: "0",
      })
    ).toBe(false);
  });
});
