import { describe, expect, it } from "vitest";
import { createHarveyLabReward } from "./rewards/harvey.js";
import { mattersFoundReward } from "./rewards/matters_found.js";
import { compositeReward, toolUsageReward } from "./rewards/composite.js";

describe("harveyLabReward", () => {
  it("adds structured recall bonus and all-pass bonus", async () => {
    const reward = createHarveyLabReward({
      runEval: async () => ({
        criteriaPassed: 2,
        criteriaTotal: 2,
        criteriaAttempted: 2,
      }),
    });
    const rollout = `clawql_memory_recall({"schema":"Matter","filters":{"status":"open"}})\nanswer`;
    const scored = await reward.score(rollout, {
      taskId: "t1",
      taskMeta: { criteria: ["a", "b"] },
    });
    expect(scored.score).toBeCloseTo(1 + 0.3 + 0.1, 5);
    expect(scored.breakdown.allPass).toBe(true);
  });

  it("applies mild penalty for semantic-only recall", async () => {
    const reward = createHarveyLabReward({
      runEval: async () => ({
        criteriaPassed: 1,
        criteriaTotal: 2,
        criteriaAttempted: 2,
      }),
    });
    const scored = await reward.score("clawql_memory_recall without schema", {
      taskId: "t1",
      taskMeta: { criteria: ["a", "b"] },
    });
    expect(scored.breakdown.usedFallbackRead).toBe(true);
    expect(scored.score).toBeLessThan(1);
  });
});

describe("mattersFoundReward", () => {
  it("zeros score on false positives", async () => {
    const rollout = `matters.json: [{"id":"m1"},{"id":"extra"}]`;
    const scored = await mattersFoundReward.score(rollout, {
      taskId: "t1",
      taskMeta: { groundTruth: { matterIds: ["m1"] } },
    });
    expect(scored.score).toBe(0);
    expect(scored.breakdown.reason).toBe("false_positives");
  });

  it("rewards full recall with structured filter bonus", async () => {
    const rollout = `matters.json: [{"id":"m1"},{"id":"m2"}]\n"filters":{"gte":2020}`;
    const scored = await mattersFoundReward.score(rollout, {
      taskId: "t1",
      taskMeta: { groundTruth: { matterIds: ["m1", "m2"] } },
    });
    expect(scored.score).toBeCloseTo(1.1, 5);
  });
});

describe("compositeReward", () => {
  it("weights component scores", async () => {
    const fn = compositeReward([
      {
        fn: {
          id: "a",
          score: async () => ({ score: 1, breakdown: {} }),
        },
        weight: 0.5,
      },
      { fn: toolUsageReward, weight: 0.5 },
    ]);
    const scored = await fn.score('clawql_memory_recall {"schema":"x","filters":{}}', {
      taskId: "t",
      taskMeta: {},
    });
    expect(scored.score).toBeCloseTo(1, 5);
  });
});
