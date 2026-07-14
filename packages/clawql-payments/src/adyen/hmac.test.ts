import { describe, expect, it } from "vitest";
import {
  adyenHmacPayload,
  signAdyenWebhookHmac,
  verifyAdyenWebhookHmac,
  type AdyenNotificationRequestItem,
} from "./hmac.js";

describe("Adyen HMAC", () => {
  const keyHex = "44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056";

  it("signs and verifies a standard notification item", () => {
    const item: AdyenNotificationRequestItem = {
      pspReference: "7914073381342284",
      originalReference: "",
      merchantAccountCode: "TestMerchant",
      merchantReference: "TestPayment-1407325143704",
      amount: { value: 1130, currency: "EUR" },
      eventCode: "AUTHORISATION",
      success: "true",
      additionalData: {},
    };
    const sig = signAdyenWebhookHmac(item, keyHex);
    item.additionalData = { hmacSignature: sig };
    expect(verifyAdyenWebhookHmac(item, keyHex)).toBe(true);
    expect(adyenHmacPayload(item)).toContain("AUTHORISATION");
  });

  it("rejects tampered amounts", () => {
    const item: AdyenNotificationRequestItem = {
      pspReference: "7914073381342284",
      merchantAccountCode: "TestMerchant",
      merchantReference: "ref",
      amount: { value: 1000, currency: "USD" },
      eventCode: "AUTHORISATION",
      success: "true",
      additionalData: {},
    };
    const sig = signAdyenWebhookHmac(item, keyHex);
    item.additionalData = { hmacSignature: sig };
    item.amount = { value: 9999, currency: "USD" };
    expect(verifyAdyenWebhookHmac(item, keyHex)).toBe(false);
  });
});
