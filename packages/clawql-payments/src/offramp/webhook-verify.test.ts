import { describe, expect, it } from "vitest";
import {
  signMoonpayWebhookV2,
  signTransakWebhookJwt,
  verifyMoonpaySignatureV2,
  verifyTransakWebhookJwt,
} from "./webhook-verify.js";

describe("offramp webhook verify", () => {
  it("verifies MoonPay Signature-V2", () => {
    const body = JSON.stringify({
      type: "sell_transaction_updated",
      data: { id: "sell_1", status: "completed", baseCurrencyAmount: 20 },
    });
    const secret = "whsec_moon_test";
    const header = signMoonpayWebhookV2(body, secret, 1_700_000_000);
    const ok = verifyMoonpaySignatureV2(body, header, secret, {
      nowSec: 1_700_000_010,
      maxSkewSec: 300,
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects stale MoonPay signatures", () => {
    const body = "{}";
    const secret = "whsec_moon_test";
    const header = signMoonpayWebhookV2(body, secret, 1_000);
    const ok = verifyMoonpaySignatureV2(body, header, secret, {
      nowSec: 1_000_000,
      maxSkewSec: 300,
    });
    expect(ok.ok).toBe(false);
  });

  it("verifies Transak HS256 JWT", () => {
    const token = "transak_partner_token";
    const jwt = signTransakWebhookJwt(
      { id: "order_1", status: "COMPLETED", cryptoAmount: 15 },
      token
    );
    const ok = verifyTransakWebhookJwt(jwt, token);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.payload.status).toBe("COMPLETED");
  });
});
