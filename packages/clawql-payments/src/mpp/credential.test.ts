import { describe, expect, it } from "vitest";
import {
  extractPaymentCredential,
  parseAuthorizationPaymentHeader,
  parseMppCredentialRaw,
} from "./credential.js";

describe("parseMppCredentialRaw", () => {
  it("parses base64url-encoded MPP credentials", () => {
    const credential = {
      challenge: {
        id: "chal_test",
        method: "stripe",
        intent: "charge",
        request: "eyJhbW91bnQiOiI1MCIsImN1cnJlbmN5IjoidXNkIn0",
      },
      payload: {
        type: "shared_payment_token",
        token: "spt_test_123",
      },
      source: "did:example:payer",
    };
    const raw = Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");
    expect(parseMppCredentialRaw(raw)).toMatchObject({
      challenge: { id: "chal_test", method: "stripe" },
      payload: { token: "spt_test_123" },
    });
  });
});

describe("parseAuthorizationPaymentHeader", () => {
  it("strips the Payment scheme prefix", () => {
    const credential = {
      challenge: { id: "a", method: "x402" },
      payload: { x402Version: 2 },
    };
    const token = Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");
    expect(parseAuthorizationPaymentHeader(`Payment ${token}`)?.challenge.id).toBe("a");
  });
});

describe("extractPaymentCredential", () => {
  it("prefers Authorization: Payment over legacy x402 headers", () => {
    const credential = {
      challenge: { id: "mpp", method: "stripe" },
      payload: { token: "spt_abc" },
    };
    const token = Buffer.from(JSON.stringify(credential), "utf8").toString("base64url");
    const parsed = extractPaymentCredential({
      authorization: `Payment ${token}`,
      "payment-signature": Buffer.from(JSON.stringify({ x402Version: 2 }), "utf8").toString(
        "base64"
      ),
    });
    expect(parsed?.kind).toBe("mpp");
  });

  it("falls back to PAYMENT-SIGNATURE x402 credentials", () => {
    const payload = {
      x402Version: 2,
      accepted: {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0xasset",
        payTo: "0xpay",
      },
      payload: { signature: "0xabc" },
    };
    const parsed = extractPaymentCredential({
      "payment-signature": Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    });
    expect(parsed?.kind).toBe("x402-signature");
  });
});
