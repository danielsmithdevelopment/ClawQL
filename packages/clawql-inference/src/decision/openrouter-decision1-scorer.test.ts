/**
 * Measure-only Decision-1 FastDecisionScorer — never lights productionTrusted.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runHeldOutValidationForUseSite } from "clawql-core/classifier";
import {
  createOpenRouterDecision1FastDecisionScorerLayer,
  OPENROUTER_DECISION1_SCORER_BACKEND_ID,
} from "./openrouter-decision1-scorer.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

describe("openrouter-decision1-scorer", () => {
  it("perfect remote accuracy still cannot light productionTrusted", async () => {
    const prevFlip = process.env.CLAWQL_FLIP_RATE_GATE;
    process.env.CLAWQL_FLIP_RATE_GATE = "0";
    try {
      const layer = createOpenRouterDecision1FastDecisionScorerLayer({
        env: { OPENROUTER_API_KEY: "sk-test" },
        callOpenRouter: (body: OpenAiDecisionCreateRequest) =>
          Effect.sync((): OpenAiDecisionCreateResponse => {
            expect(body.allow_uncalibrated).toBe(true);
            expect(body.model).toMatch(/decision-1/i);
            const choiceQ = body.questions.find((q) => q.type === "choice");
            expect(choiceQ?.type).toBe("choice");
            return {
              id: "r",
              object: "decision",
              model: "microsoft/microsoft-decision-1",
              created: 1,
              answers: [
                {
                  type: "choice",
                  name: "route",
                  choice: "hit",
                  confidence: 0.99,
                  probabilities: [
                    { value: "hit", probability: 0.99 },
                    { value: "miss", probability: 0.01 },
                  ],
                },
              ],
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                total_tokens: 2,
                input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 0 },
              },
              calibrated: false,
              escalated: false,
              use_site_id: "skill_fast_path_match",
              backend_id: OPENROUTER_DECISION1_SCORER_BACKEND_ID,
              trace_id: "t",
            };
          }),
      });

      const suite = {
        suiteId: "d1-measure-not-trusted",
        description: "Decision-1 measure scorer must not light trust",
        cases: [
          {
            caseId: "p1",
            useSiteId: "skill_fast_path_match",
            query: "route this to the hit tool",
            candidates: [
              { candidateId: "hit", features: { description: "correct route" } },
              { candidateId: "miss", features: { description: "wrong route" } },
            ],
            groundTruthCandidateId: "hit",
            adjudicated: true,
            adjudicationKind: "live" as const,
          },
        ],
      };

      const report = await Effect.runPromise(
        runHeldOutValidationForUseSite(suite, "skill_fast_path_match", {
          minAccuracy: 0.7,
          maxMeanCalibrationError: 0.2,
          minCases: 1,
        }).pipe(Effect.provide(layer))
      );

      expect(report.passedCriteria).toBe(true);
      expect(report.scorerBackend).toBe(OPENROUTER_DECISION1_SCORER_BACKEND_ID);
      expect(report.scorerBackend).not.toBe("gliner-decide");
      expect(report.productionTrusted).toBe(false);
      expect(report.failureReasons.some((x) => /not live gliner-decide/i.test(x))).toBe(true);
    } finally {
      if (prevFlip === undefined) delete process.env.CLAWQL_FLIP_RATE_GATE;
      else process.env.CLAWQL_FLIP_RATE_GATE = prevFlip;
    }
  });
});
