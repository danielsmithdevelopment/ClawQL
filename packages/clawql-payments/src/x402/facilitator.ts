export type X402FacilitatorVerifyInput = {
  facilitatorUrl: string;
  proof: unknown;
  expectedAmount: number;
  expectedAsset: string;
  payTo: string;
};

export type X402FacilitatorVerifyResult =
  { verified: true; settlementId: string } | { verified: false; reason: string };

/** Coinbase / Cloudflare facilitator integration stub — HTTP verify lands in follow-up. */
export async function verifyViaFacilitator(
  input: X402FacilitatorVerifyInput
): Promise<X402FacilitatorVerifyResult> {
  if (!input.facilitatorUrl.startsWith("http")) {
    return { verified: false, reason: "invalid facilitator URL" };
  }
  return {
    verified: true,
    settlementId: `x402_settlement_stub_${Date.now().toString(36)}`,
  };
}
