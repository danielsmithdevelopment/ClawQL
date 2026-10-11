/**
 * Spend-ledger cost models for fan-out recommendation.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  buildSpendCostLookup,
  costPerCallFromSpendRow,
  lookupSpendCostPerCase,
  SPEND_INPUT_USD_PER_TOKEN,
  SPEND_OUTPUT_USD_PER_TOKEN,
} from "./spend-cost.js";
import { runFanoutEval } from "./fanout-eval.js";
import type { DecisionRequest, DecisionResponse } from "./service.js";

describe("spend-cost ledger", () => {
  it("averages USD per call from provider-priced token rollups", async () => {
    const cost = await Effect.runPromise(
      costPerCallFromSpendRow({
        key: "gpt-6-luna",
        calls: 2,
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
      })
    );
    // gpt-6-luna estimate: $2.5 / $10 per 1M → (2M*2.5e-6 + 1M*1e-5) / 2
    const expected = (2_000_000 * (2.5 / 1_000_000) + 1_000_000 * (10 / 1_000_000)) / 2;
    expect(cost).toBeCloseTo(expected, 10);
    expect(cost).toBeGreaterThan(
      (2_000_000 * SPEND_INPUT_USD_PER_TOKEN + 1_000_000 * SPEND_OUTPUT_USD_PER_TOKEN) / 2
    );
  });

  it("indexes leaf model ids for backend matching", async () => {
    const lookup = await Effect.runPromise(
      buildSpendCostLookup([
        { key: "openai/gpt-6-luna", calls: 10, inputTokens: 10_000_000, outputTokens: 0 },
      ])
    );
    const byLeaf = await Effect.runPromise(
      lookupSpendCostPerCase({ id: "remote", model: "gpt-6-luna" }, lookup)
    );
    const byFull = await Effect.runPromise(
      lookupSpendCostPerCase({ id: "openai/gpt-6-luna" }, lookup)
    );
    // 10M input @ $2.5/1M / 10 calls = $2.50
    expect(byLeaf).toBeCloseTo(2.5, 6);
    expect(byFull).toBeCloseTo(2.5, 6);
  });

  it("fan-out spend_ledger fills missing costPerCase for recommendation", async () => {
    const decideBilling = (_req: DecisionRequest): Promise<DecisionResponse> =>
      Promise.resolve({
        object: "clawql.decision",
        answers: [
          {
            name: "department",
            type: "choice",
            answer: "billing",
            abstained: false,
            escalated: false,
            calibrated: false,
            backendId: "stub",
            useSiteId: "search_provider_tool_routing",
          },
        ],
        traceId: "stub",
        escalated: false,
        calibrated: false,
        backendId: "stub",
      });

    const spendCosts = await Effect.runPromise(
      buildSpendCostLookup([
        { key: "clawql", calls: 100, inputTokens: 0, outputTokens: 0 },
        {
          key: "gpt-6-luna",
          calls: 10,
          inputTokens: 10_000_000,
          outputTokens: 0,
        },
      ])
    );

    const result = await runFanoutEval(
      {
        mode: "bulk",
        costSource: "spend_ledger",
        spendCosts,
        cases: [
          {
            caseId: "billing-1",
            state: "I was charged twice for my order.",
            questions: [
              {
                type: "choice",
                name: "department",
                options: [
                  { id: "billing", description: "Payments" },
                  { id: "shipping", description: "Delivery" },
                ],
              },
            ],
            expected: [{ name: "department", answer: "billing" }],
          },
        ],
        backends: [
          { id: "local", model: "clawql" },
          { id: "openai/gpt-6-luna", model: "gpt-6-luna" },
        ],
        qualityBar: { maxWrongAnswers: 0, minAnswered: 1 },
      },
      {
        env: {},
        decide: decideBilling,
        callRemote: async () => ({
          id: "r",
          object: "decision",
          model: "gpt-6-luna",
          created: 1,
          answers: [
            {
              type: "choice",
              name: "department",
              choice: "billing",
              confidence: 0.9,
              probabilities: [{ value: "billing", probability: 0.9 }],
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
          use_site_id: "search_provider_tool_routing",
          backend_id: "openai/gpt-6-luna",
          trace_id: "t",
        }),
      }
    );

    const local = result.reports.find((r) => r.backendId === "local");
    const luna = result.reports.find((r) => r.backendId === "openai/gpt-6-luna");
    expect(local?.costEstimate).toBe(0);
    // 10M input @ $2.5/1M / 10 calls = $2.50 per case
    expect(luna?.costEstimate).toBeCloseTo(2.5, 6);
    expect(result.recommendation?.backendId).toBe("local");
  });

  it("unknown model keys keep historic $1/$3 per 1M fallback", async () => {
    const cost = await Effect.runPromise(
      costPerCallFromSpendRow({
        key: "acme/mystery-model",
        calls: 1,
        inputTokens: 1_000_000,
        outputTokens: 0,
      })
    );
    expect(cost).toBeCloseTo(SPEND_INPUT_USD_PER_TOKEN * 1_000_000, 10);
  });
});
