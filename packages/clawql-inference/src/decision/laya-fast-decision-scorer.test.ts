import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FastDecisionScorer } from "clawql-core/classifier";
import { createLayaFastDecisionScorerLayer } from "./laya-fast-decision-scorer.js";
import { LAYA_BACKEND_ID } from "./remote-laya.js";

describe("laya-fast-decision-scorer", () => {
  it("maps SystemOne choice probabilities onto candidates", async () => {
    const layer = createLayaFastDecisionScorerLayer({
      callLaya: () =>
        Effect.succeed({
          id: "t",
          object: "decision",
          model: "english",
          created: 0,
          answers: [
            {
              type: "choice",
              name: "route",
              choice: "hit",
              confidence: 0.9,
              probabilities: [
                { value: "hit", probability: 0.9 },
                { value: "miss", probability: 0.1 },
              ],
            },
          ],
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
          calibrated: false,
          escalated: false,
          use_site_id: "search_provider_tool_routing",
          backend_id: LAYA_BACKEND_ID,
          trace_id: "t",
        }),
    });

    const scores = await Effect.runPromise(
      Effect.gen(function* () {
        const scorer = yield* FastDecisionScorer;
        expect(scorer.backendId()).toBe(LAYA_BACKEND_ID);
        return yield* scorer.score({
          useSiteId: "search_provider_tool_routing",
          ctx: { query: "search stripe" },
          candidates: [
            { candidateId: "hit", features: { description: "search" } },
            { candidateId: "miss", features: { description: "execute" } },
          ],
        });
      }).pipe(Effect.provide(layer))
    );

    expect(scores[0]?.candidateId).toBe("hit");
    expect(scores[0]?.confidence).toBeCloseTo(0.9);
  });
});
