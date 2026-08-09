import type { GrpoTask, RewardFunction, RewardScore } from "../types.js";
import { harveyLabReward } from "./harvey.js";

/** Mild bonus for structured clawql_memory_recall usage (schema + filters). */
export const toolUsageReward: RewardFunction = {
  id: "tool_usage_structured_recall",
  description: "Bonus for clawql_memory_recall with schema + filters",
  async score(rollout: string): Promise<RewardScore> {
    const used =
      rollout.includes("clawql_memory_recall") &&
      rollout.includes('"schema"') &&
      rollout.includes('"filters"');
    return {
      score: used ? 1 : 0,
      breakdown: { usedStructuredRecall: used },
    };
  },
};

export function compositeReward(
  rewards: { fn: RewardFunction; weight: number }[]
): RewardFunction {
  return {
    id: `composite_${rewards.map((r) => r.fn.id).join("_")}`,
    async score(rollout: string, task: GrpoTask): Promise<RewardScore> {
      const scores = await Promise.all(rewards.map((r) => r.fn.score(rollout, task)));
      const weighted = scores.reduce((sum, s, i) => sum + s.score * (rewards[i]?.weight ?? 0), 0);
      return {
        score: weighted,
        breakdown: Object.fromEntries(rewards.map((r, i) => [r.fn.id, scores[i]])),
      };
    },
  };
}

export const harveyWithToolReward = compositeReward([
  { fn: harveyLabReward, weight: 0.8 },
  { fn: toolUsageReward, weight: 0.2 },
]);
