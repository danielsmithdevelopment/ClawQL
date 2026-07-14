import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetPaymentsEffectRuntimeForTests,
  runPaymentsEffect,
} from "../runtime/payments-effect-runtime.js";
import { AdyenCheckoutService } from "./adyen-checkout-service.js";
import { signAdyenWebhookHmac } from "./hmac.js";

describe("AdyenCheckoutService", () => {
  afterEach(() => {
    delete process.env.CLAWQL_ADYEN_ENABLED;
    delete process.env.ADYEN_API_KEY;
    delete process.env.ADYEN_MERCHANT_ACCOUNT;
    delete process.env.ADYEN_HMAC_KEY;
    delete process.env.CLAWQL_PAYMENTS_AUDIT_STORE;
    delete process.env.CLAWQL_HOME;
    resetPaymentsEffectRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("creates a checkout session against mocked Adyen API", async () => {
    process.env.CLAWQL_HOME = "/tmp/clawql-adyen-test";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_ADYEN_ENABLED = "1";
    process.env.ADYEN_API_KEY = "AQEyhmfx...";
    process.env.ADYEN_MERCHANT_ACCOUNT = "ClawQLCOM";
    resetPaymentsEffectRuntimeForTests();

    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      expect(href).toContain("/sessions");
      return new Response(
        JSON.stringify({
          id: "CS123",
          sessionData: "Ab02b4c0...",
          amount: { value: 2900, currency: "USD" },
          reference: "ignored-by-client",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await runPaymentsEffect(
      Effect.gen(function* () {
        const adyen = yield* AdyenCheckoutService;
        return yield* adyen.createSession({
          amountUsd: 29,
          reference: "ord_1",
          returnUrl: "https://example.com/return",
        });
      })
    );

    expect(session.id).toBe("CS123");
    expect(session.sessionData).toBeTruthy();
    expect(session.amount.value).toBe(2900);
  });

  it("processes AUTHORISATION webhook with valid HMAC", async () => {
    const keyHex = "44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056";
    process.env.CLAWQL_HOME = "/tmp/clawql-adyen-webhook";
    process.env.CLAWQL_PAYMENTS_AUDIT_STORE = "memory";
    process.env.CLAWQL_ADYEN_ENABLED = "1";
    process.env.ADYEN_API_KEY = "key";
    process.env.ADYEN_MERCHANT_ACCOUNT = "ClawQLCOM";
    process.env.ADYEN_HMAC_KEY = keyHex;
    resetPaymentsEffectRuntimeForTests();

    const item = {
      pspReference: "PSP1",
      originalReference: "",
      merchantAccountCode: "ClawQLCOM",
      merchantReference: "ord_2",
      amount: { value: 500, currency: "USD" },
      eventCode: "AUTHORISATION",
      success: "true",
      additionalData: {} as Record<string, string>,
    };
    item.additionalData.hmacSignature = signAdyenWebhookHmac(item, keyHex);

    const result = await runPaymentsEffect(
      Effect.gen(function* () {
        const adyen = yield* AdyenCheckoutService;
        return yield* adyen.processWebhook({
          notificationItems: [{ NotificationRequestItem: item }],
        });
      })
    );

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.events[0]?.eventCode).toBe("AUTHORISATION");
    expect(result.events[0]?.success).toBe(true);
  });
});
