import { describe, expect, it } from "vitest";
import { shouldAutoMerge } from "./index.js";

describe("shouldAutoMerge", () => {
  it("auto-merges only when calibrated, confident, clean", () => {
    const r = shouldAutoMerge({
      decision: { winner: "att_1", calibrated: true, confidence: 0.95 },
      winnerTestsFailed: 0,
      winnerPolicyClean: true,
    });
    expect(r.auto).toBe(true);
  });

  it("routes OpenAI-style (missing calibrated) to approval", () => {
    const r = shouldAutoMerge({
      decision: { winner: "att_1", confidence: 0.99 },
      winnerTestsFailed: 0,
      winnerPolicyClean: true,
    });
    expect(r.auto).toBe(false);
    expect(r.reason).toBe("uncalibrated");
  });

  it("refuses blocked winners even when calibrated", () => {
    const r = shouldAutoMerge({
      decision: { winner: "att_3", calibrated: true, confidence: 0.99 },
      winnerTestsFailed: 0,
      winnerPolicyClean: false,
    });
    expect(r.auto).toBe(false);
    expect(r.reason).toBe("policy_blocked");
  });
});
