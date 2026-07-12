import { describe, expect, it, vi } from "vitest";
import {
  resolveFacilitatorEndpoint,
  usdcAtomicAmount,
  isX402EnforcementActive,
} from "./config.js";
import { verifyViaFacilitator } from "./facilitator.js";
import type { X402PaymentPayloadV2, X402PaymentRequirements } from "./types.js";

describe("x402 facilitator HTTP", () => {
  it("resolves verify and settle endpoints", () => {
    expect(resolveFacilitatorEndpoint("https://x402.org/facilitator", "verify")).toBe(
      "https://x402.org/facilitator/verify"
    );
    expect(resolveFacilitatorEndpoint("https://api.cdp.coinbase.com/platform/v2/x402", "verify")).toBe(
      "https://api.cdp.coinbase.com/platform/v2/x402/verify"
    );
  });

  it("converts USDC prices to atomic units", () => {
    expect(usdcAtomicAmount(0.001)).toBe("1000");
    expect(usdcAtomicAmount(1)).toBe("1000000");
  });

  it("detects enforcement flag", () => {
    expect(isX402EnforcementActive({ CLAWQL_X402_ENFORCE: "1" })).toBe(true);
    expect(isX402EnforcementActive({})).toBe(false);
  });

  it("posts payment payload to facilitator verify", async () => {
    const paymentPayload: X402PaymentPayloadV2 = {
      x402Version: 2,
      payload: { signature: "0xabc" },
    };
    const paymentRequirements: X402PaymentRequirements = {
      scheme: "exact",
      network: "eip155:84532",
      amount: "1000",
      asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      payTo: "0xabc123",
    };

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ isValid: true, payer: "0xpayer" }),
    }));

    const result = await verifyViaFacilitator({
      facilitatorUrl: "https://x402.org/facilitator",
      paymentPayload,
      paymentRequirements,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.verified).toBe(true);
    expect(result.payer).toBe("0xpayer");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x402.org/facilitator/verify");
    expect(init.method).toBe("POST");
  });

  it("returns facilitator invalid reason", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ isValid: false, invalidReason: "insufficient_funds", payer: "0x1" }),
    }));

    const result = await verifyViaFacilitator({
      facilitatorUrl: "https://x402.org/facilitator",
      paymentPayload: { x402Version: 2 },
      paymentRequirements: {
        scheme: "exact",
        network: "eip155:84532",
        amount: "1000",
        asset: "0xasset",
        payTo: "0xpayto",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.verified).toBe(false);
    if (!result.verified) {
      expect(result.reason).toBe("insufficient_funds");
    }
  });
});
