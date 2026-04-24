/**
 * Default Wonder / Reflect / Executor / Evaluator for Ouroboros when no LLM wiring exists yet (#141).
 * Executor returns structured JSON; evaluator checks for a synthetic error marker.
 */

import type { Evaluator, Executor, ReflectEngine, Seed, WonderEngine } from "clawql-ouroboros";

export function createDefaultOuroborosEngines(): {
  wonder: WonderEngine;
  reflect: ReflectEngine;
  execute: Executor;
  evaluate: Evaluator;
} {
  const wonder: WonderEngine = {
    wonder: async (_seed, _previousEvaluation) => ({
      insights: [],
      suggested_refinements: [],
      requires_evolution: false,
    }),
  };

  const reflect: ReflectEngine = {
    reflect: async (_seed, _executionOutput, _evaluation, _wonder) => ({
      newSeedData: {},
      rationale: "clawql-mcp default reflect (no-op)",
    }),
  };

  const execute: Executor = {
    execute: async (seed: Seed) =>
      JSON.stringify({
        kind: "clawql-ouroboros-default-execute",
        goal: seed.goal,
        note: "Wire Executor to search/execute or domain logic; see GitHub #110 / #141.",
      }),
  };

  const evaluate: Evaluator = {
    evaluate: async (executionOutput: string, seed: Seed) => {
      const failed =
        /"kind"\s*:\s*"error"/i.test(executionOutput) || /\berror\b/i.test(executionOutput);
      const ac_results = seed.acceptance_criteria.map((c, i) => ({
        ac_index: i,
        ac_content: c,
        passed: !failed && executionOutput.length > 0,
        evidence: failed
          ? "default evaluator: error-like output"
          : "default evaluator: non-empty output",
      }));
      const allPass = ac_results.every((a) => a.passed);
      return {
        final_approved: allPass,
        score: allPass ? 0.88 : 0.2,
        ac_results,
      };
    },
  };

  return { wonder, reflect, execute, evaluate };
}
