import type { GrpoTask, RewardFunction, RewardScore } from "../types.js";

export type HarveyEvalResult = {
  criteriaPassed: number;
  criteriaTotal: number;
  criteriaAttempted: number;
};

export type HarveyEvalRunner = (input: {
  rollout: string;
  taskId: string;
  criteria: unknown[] | undefined;
  judgeModel: string;
}) => Promise<HarveyEvalResult>;

/**
 * Heuristic offline scorer when Harvey harness is unavailable.
 * Counts checklist-style criterion strings that appear in the rollout.
 */
export async function defaultHarveyEvalRunner(input: {
  rollout: string;
  taskId: string;
  criteria: unknown[] | undefined;
  judgeModel: string;
}): Promise<HarveyEvalResult> {
  void input.taskId;
  void input.judgeModel;
  const criteria = (input.criteria ?? []).map(String);
  const total = criteria.length || 1;
  let passed = 0;
  for (const c of criteria) {
    if (c && input.rollout.toLowerCase().includes(c.toLowerCase())) passed += 1;
  }
  return {
    criteriaPassed: passed,
    criteriaTotal: total,
    criteriaAttempted: total,
  };
}

export function createHarveyLabReward(options?: {
  judgeModel?: string;
  runEval?: HarveyEvalRunner;
}): RewardFunction {
  const judgeModel =
    options?.judgeModel ??
    process.env.CLAWQL_HARVEY_JUDGE_MODEL?.trim() ??
    "claude-sonnet-4-6";
  const runEval = options?.runEval ?? defaultHarveyEvalRunner;

  return {
    id: "harvey_lab_rubric",
    description: "Harvey LAB per-criterion rubric scoring",
    async score(rollout: string, task: GrpoTask): Promise<RewardScore> {
      const result = await runEval({
        rollout,
        taskId: task.taskId,
        criteria: task.taskMeta.criteria,
        judgeModel,
      });

      const criterionPassRate = result.criteriaPassed / (result.criteriaTotal || 1);
      const allPass = result.criteriaPassed === result.criteriaTotal;
      const precision = result.criteriaPassed / (result.criteriaAttempted || 1);
      const recall = criterionPassRate;
      const f1 = (2 * precision * recall) / (precision + recall + 1e-8);

      const usedStructuredRecall =
        rollout.includes("clawql_memory_recall") &&
        rollout.includes('"schema"') &&
        rollout.includes('"filters"');

      const usedFallbackRead =
        rollout.includes("clawql_memory_recall") && !rollout.includes('"schema"');

      return {
        score:
          f1 +
          (allPass ? 0.3 : 0) +
          (usedStructuredRecall ? 0.1 : 0) -
          (usedFallbackRead ? 0.05 : 0),
        breakdown: {
          f1,
          allPassBonus: allPass ? 0.3 : 0,
          toolUsageBonus: usedStructuredRecall ? 0.1 : 0,
          criteriaPassed: result.criteriaPassed,
          criteriaTotal: result.criteriaTotal,
          criterionPassRate,
          allPass,
          usedStructuredRecall,
          usedFallbackRead,
        },
      };
    },
  };
}

/** Default Harvey LAB reward (heuristic judge until harness is wired). */
export const harveyLabReward: RewardFunction = createHarveyLabReward();
