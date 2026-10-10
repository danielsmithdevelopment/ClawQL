import { describe, expect, it, vi } from "vitest";
import {
  applyDecision,
  buildWinnerRequest,
  fetchDecision,
  localCalibratedDecision,
  localOpenAIShapedDecision,
} from "./index.js";

describe("decider", () => {
  it("auto-merges calibrated confident clean winners", () => {
    const o = applyDecision(localCalibratedDecision("att_1"), {
      testsFailed: 0,
      policyClean: true,
    });
    expect(o.autoMerge).toBe(true);
  });

  it("routes OpenAI-shaped responses to approval", () => {
    const o = applyDecision(localOpenAIShapedDecision("att_1"), {
      testsFailed: 0,
      policyClean: true,
    });
    expect(o.autoMerge).toBe(false);
    expect(o.reason).toBe("uncalibrated");
  });

  it("fetchDecision posts and maps JSON", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(localCalibratedDecision("att_2")), { status: 200 })
    );
    const d = await fetchDecision(
      { decisionsUrl: "https://example.test/v1/decisions" },
      buildWinnerRequest({
        prompt: "fix",
        choices: [{ value: "att_2", description: "ok" }],
      }),
      fetchFn as unknown as typeof fetch
    );
    expect(d.winner).toBe("att_2");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("parses att_N from OpenAI-like text body", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "I pick att_3 as winner." } }] }),
        { status: 200 }
      )
    );
    const d = await fetchDecision(
      { decisionsUrl: "https://example.test/v1/chat" },
      buildWinnerRequest({ prompt: "x", choices: [{ value: "att_3", description: "b" }] }),
      fetchFn as unknown as typeof fetch
    );
    expect(d.winner).toBe("att_3");
    expect(d.calibrated).toBeUndefined();
  });
});
