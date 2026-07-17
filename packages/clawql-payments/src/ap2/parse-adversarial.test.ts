import { describe, expect, it } from "vitest";
import { Ap2Error, signHs256Jwt } from "./jwt.js";
import { mandateCoversAmount, parsePaymentMandate } from "./parse.js";
import { VCT_PAYMENT_CLOSED } from "./types.js";

describe("AP2 parse adversarial", () => {
  const secret = "ap2-hmac-secret";

  it("rejects JSON string mandates when HMAC secret is configured", () => {
    expect(() =>
      parsePaymentMandate(
        JSON.stringify({
          vct: VCT_PAYMENT_CLOSED,
          payment_amount: { currency: "USD", value: 100 },
        }),
        { hmacSecret: secret }
      )
    ).toThrow(/signed HS256 JWT/i);
  });

  it("still accepts object mandates (non-string) without signature when not required", () => {
    const { mandate, signed } = parsePaymentMandate(
      {
        vct: VCT_PAYMENT_CLOSED,
        payment_amount: { currency: "USD", value: 100 },
      },
      { hmacSecret: secret }
    );
    expect(signed).toBe(false);
    expect(mandate.payment_amount?.value).toBe(100);
  });

  it("requireSignature rejects unsigned JWT when secret unset", () => {
    const token = signHs256Jwt(
      { vct: VCT_PAYMENT_CLOSED, payment_amount: { currency: "USD", value: 50 } },
      secret
    );
    expect(() => parsePaymentMandate(token, { requireSignature: true })).toThrow(Ap2Error);
  });

  it("rejects alg:none JWT even without HMAC secret", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = Buffer.from(
      JSON.stringify({
        vct: VCT_PAYMENT_CLOSED,
        payment_amount: { currency: "USD", value: 99999 },
      }),
      "utf8"
    )
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(() => parsePaymentMandate(`${header}.${payload}.`)).toThrow(/alg/i);
  });

  it("mandateCoversAmount denies missing amount and currency mismatch", () => {
    const { mandate } = parsePaymentMandate({
      vct: VCT_PAYMENT_CLOSED,
      payment_instrument: { type: "card" },
    });
    expect(mandateCoversAmount(mandate, 0.01, "USD")).toBe(false);

    const capped = parsePaymentMandate({
      vct: VCT_PAYMENT_CLOSED,
      payment_amount: { currency: "EUR", value: 100 },
    }).mandate;
    expect(mandateCoversAmount(capped, 0.5, "USD")).toBe(false);
  });
});
