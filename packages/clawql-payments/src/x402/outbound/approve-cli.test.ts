import { describe, expect, it } from "vitest";
import { isPaymentsApproveBlockedInHarness, runPaymentsOutboundApprove } from "./approve-cli.js";

describe("payments approve CLI (audit Y4)", () => {
  it("detects harness env", () => {
    expect(isPaymentsApproveBlockedInHarness({})).toBe(false);
    expect(isPaymentsApproveBlockedInHarness({ CLAWQL_IN_HARNESS: "1" })).toBe(true);
    expect(isPaymentsApproveBlockedInHarness({ CLAWQL_HARNESS_ID: "claude" })).toBe(true);
  });

  it("refuses approve inside harness", async () => {
    const code = await runPaymentsOutboundApprove({
      quoteDigest: "abc",
      env: { CLAWQL_IN_HARNESS: "1", CLAWQL_TIER: "standard" },
    });
    expect(code).toBe(1);
  });

  it("refuses under regulated", async () => {
    const code = await runPaymentsOutboundApprove({
      quoteDigest: "abc",
      env: { CLAWQL_TIER: "regulated" },
    });
    expect(code).toBe(1);
  });
});
