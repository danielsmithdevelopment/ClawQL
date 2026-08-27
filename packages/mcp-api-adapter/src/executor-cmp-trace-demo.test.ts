import { describe, expect, it } from "vitest";
import {
  EXECUTOR_CMP_MEASUREMENTS,
  executorCmpDerivedStats,
} from "./executor-cmp-trace-demo.js";

describe("executorCmpDerivedStats", () => {
  it("matches executor-cmp-001.live.json headline math", () => {
    const m = EXECUTOR_CMP_MEASUREMENTS;
    const stats = executorCmpDerivedStats();

    expect(m.clawql.toolDefsTokens + m.clawql.toolResultTokens).toBe(
      m.clawql.combinedInputTokens
    );
    expect(m.executor.toolDefsTokensLive + m.executor.toolResultTokens).toBe(
      m.executor.combinedInputTokensLive
    );
    expect(m.executor.toolDefsTokensPublished + m.executor.toolResultTokens).toBe(
      m.executor.combinedInputTokensPublished
    );

    expect(stats.ratioCombinedLive).toBeCloseTo(110.4, 1);
    expect(stats.ratioCombinedPublishedL1).toBeCloseTo(111.1, 1);
    expect(stats.layer2PctExecutor).toBe(100);
    expect(stats.layer2PctClawql).toBe(70);
  });
});
