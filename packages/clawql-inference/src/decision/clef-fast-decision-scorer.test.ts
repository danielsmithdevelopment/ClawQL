/**
 * Measure-only Clef FastDecisionScorer — never lights productionTrusted.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { runHeldOutValidationForUseSite } from "clawql-core/classifier";
import { createClefFastDecisionScorerLayer } from "./clef-fast-decision-scorer.js";
import { CLEF_FLASH_BACKEND_ID } from "./remote-clef.js";
import type { OpenAiDecisionCreateRequest, OpenAiDecisionCreateResponse } from "./openai-types.js";

describe("clef-fast-decision-scorer", () => {
  it("perfect remote accuracy still cannot light productionTrusted", async () => {
    const prevFlip = process.env.CLAWQL_FLIP_RATE_GATE;
    process.env.CLAWQL_FLIP_RATE_GATE = "0";
    try {
      const layer = createClefFastDecisionScorerLayer({
        env: {
          CLOUDFLARE_API_TOKEN: "tok",
          CLOUDFLARE_ACCOUNT_ID: "acct",
          CLAWQL_CLEF_MODEL: "clef-flash",
        },
        callClef: (body: OpenAiDecisionCreateRequest) =>
          Effect.sync((): OpenAiDecisionCreateResponse => {
            expect(body.allow_uncalibrated).toBe(true);
            expect(body.model).toMatch(/clef/i);
            return {
              id: "r",
              object: "decision",
              model: "clef-flash",
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
              backend_id: CLEF_FLASH_BACKEND_ID,
              trace_id: "t",
            };
          }),
      });

      const suite = {
        suiteId: "clef-measure-not-trusted",
        description: "Clef measure scorer must not light trust",
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
      expect(report.scorerBackend).toBe(CLEF_FLASH_BACKEND_ID);
      expect(report.scorerBackend).not.toBe("gliner2");
      expect(report.productionTrusted).toBe(false);
      expect(report.failureReasons.some((x) => /not live gliner2/i.test(x))).toBe(true);
    } finally {
      if (prevFlip === undefined) delete process.env.CLAWQL_FLIP_RATE_GATE;
      else process.env.CLAWQL_FLIP_RATE_GATE = prevFlip;
    }
  });
});
