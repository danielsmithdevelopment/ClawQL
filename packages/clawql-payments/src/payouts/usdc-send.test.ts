import { describe, expect, it } from "vitest";
import { sendUsdcPayout, usdcPayoutChainId, USDC_BASE_SEPOLIA } from "./usdc-send.js";

describe("sendUsdcPayout", () => {
  it("dry-runs without private key", async () => {
    const env = {
      CLAWQL_PAYOUTS_USDC_DRY_RUN: "1",
      CLAWQL_PAYOUTS_USDC_CHAIN_ID: "84532",
    } as NodeJS.ProcessEnv;
    const result = await sendUsdcPayout(
      {
        to: "0x3333333333333333333333333333333333333333",
        amountUsd: 12.5,
      },
      env
    );
    expect(result.dryRun).toBe(true);
    expect(result.txHash.startsWith("0xdry")).toBe(true);
    expect(result.amountAtomic).toBe(12_500_000n);
    expect(result.chainId).toBe(84532);
    expect(usdcPayoutChainId(env)).toBe(84532);
    expect(result.usdcAsset.toLowerCase()).toBe(USDC_BASE_SEPOLIA.toLowerCase());
  });

  it("rejects invalid address", async () => {
    await expect(
      sendUsdcPayout({ to: "not-an-address", amountUsd: 1 }, { CLAWQL_PAYOUTS_USDC_DRY_RUN: "1" })
    ).rejects.toMatchObject({ reason: expect.stringMatching(/Invalid USDC wallet/) });
  });
});
