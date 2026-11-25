import { describe, expect, it, vi } from "vitest";
import {
  isPaymentsApproveBlockedInHarness,
  runPaymentsOperatorKeyGenerate,
  runPaymentsOutboundApprove,
} from "./approve-cli.js";

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

describe("payments operator-key generate (audit Z2)", () => {
  it("prints key + hash as JSON", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await runPaymentsOperatorKeyGenerate({ json: true });
    expect(code).toBe(0);
    const printed = spy.mock.calls.map((c) => String(c[0])).join("\n");
    const parsed = JSON.parse(printed) as { key: string; hash: string };
    expect(parsed.key.length).toBeGreaterThan(20);
    expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/);
    spy.mockRestore();
  });
});
