/**
 * Decision-1 candidate report — always measure-only.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { HeldOutSuiteManifest } from "clawql-core/classifier";
import { buildDecision1CandidateReport } from "./decision1-candidate-report.js";
import type { FanoutEvalResponse } from "./fanout-eval.js";
import type { FlipRateResponse } from "./flip-rate.js";

const suite: HeldOutSuiteManifest = {
  suiteId: "fast-decision-held-out-v0.4-routing-fresh",
  description: "test suite",
  cases: [
    {
      caseId: "route-v04-001",
      useSiteId: "search_provider_tool_routing",
      query: "Find the operationId for refunds before calling anything.",
      candidates: [
        {
          candidateId: "mcp.search",
          features: { description: "Discover operationIds" },
        },
        {
          candidateId: "mcp.execute",
          features: { description: "Run known operationId" },
        },
      ],
      groundTruthCandidateId: "mcp.search",
      adjudicated: false,
    },
  ],
};

describe("decision1-candidate-report", () => {
  it("always sets productionTrustedClaim false and echoes Decision-1 flip pin", async () => {
    const bulk: FanoutEvalResponse = {
      object: "clawql.decision.fanout_eval",
      mode: "bulk",
      matchMode: "twin",
      reports: [
        {
          backendId: "local",
          model: "clawql",
          answered: 1,
          correct: 1,
          wrong: 0,
          abstained: 0,
          skipped: 0,
          answersOnItsOwn: 1,
          meetsQualityBar: true,
        },
        {
          backendId: "openrouter/microsoft/microsoft-decision-1",
          model: "microsoft/microsoft-decision-1",
          answered: 1,
          correct: 1,
          wrong: 0,
          abstained: 0,
          skipped: 0,
          answersOnItsOwn: 1,
          meetsQualityBar: true,
        },
      ],
      recommendation: {
        backendId: "local",
        reason: "cheapest meeting bar",
      },
      disagreements: [],
      reviewCount: 0,
      traceId: "t",
      caseCount: 1,
    };

    const flip: FlipRateResponse = {
      object: "clawql.decision.flip_rate",
      maxFlipRate: 0.1,
      families: ["synonym"],
      caseCount: 1,
      totalPerturbations: 1,
      passed: true,
      reports: [
        {
          caseId: "route-v04-001",
          baseline: "mcp.search",
          perturbations: 1,
          flips: 0,
          flipRate: 0,
          passed: true,
          details: [],
        },
      ],
      traceId: "f",
      backendId: "openrouter/microsoft/microsoft-decision-1",
      model: "microsoft/microsoft-decision-1",
    };

    let bulkReqMatchMode: string | undefined;
    let bulkReqCostSource: string | undefined;
    let localCost: number | undefined;
    const report = await Effect.runPromise(
      buildDecision1CandidateReport({
        suite,
        labels: {
          labels: [
            {
              caseId: "route-v04-001",
              groundTruthCandidateId: "mcp.search",
              adjudicated: true,
            },
          ],
        },
        runBulk: async (req) => {
          bulkReqMatchMode = req.matchMode;
          bulkReqCostSource = req.costSource;
          localCost = req.backends.find((b) => b.id === "local")?.costPerCase;
          return bulk;
        },
        runFlip: async () => flip,
      })
    );

    expect("error" in report).toBe(false);
    if ("error" in report) return;
    expect(report.verdict.productionTrustedClaim).toBe(false);
    expect(report.verdict.calibratedClaim).toBe(false);
    expect(report.groundTruthSource).toBe("frontier_labels");
    expect(bulkReqMatchMode).toBe("twin");
    expect(bulkReqCostSource).toBe("explicit");
    expect(localCost).toBe(0);
    expect(report.bulk.matchMode).toBe("twin");
    expect(report.bulk.costSource).toBe("explicit");
    expect(report.flipRate.backendId).toBe("openrouter/microsoft/microsoft-decision-1");
    expect(report.flipRate.model).toBe("microsoft/microsoft-decision-1");
    expect(report.flipRate.passed).toBe(true);
    expect(report.bulk.recommendation?.backendId).toBe("local");
    expect(report.honesty.some((h) => /productionTrusted/i.test(h))).toBe(true);
    expect(report.honesty.some((h) => /twin-aware|candidatesEquivalent/i.test(h))).toBe(true);
    expect(report.honesty.some((h) => /costEstimate/i.test(h))).toBe(true);
  });

  it("skips flip-rate when OpenRouter unkeyed but still emits measure report", async () => {
    const report = await Effect.runPromise(
      buildDecision1CandidateReport({
        suite,
        runBulk: async () => ({
          object: "clawql.decision.fanout_eval",
          mode: "bulk",
          matchMode: "twin",
          reports: [],
          disagreements: [],
          reviewCount: 0,
          traceId: "t",
          caseCount: 1,
        }),
        runFlip: async () => {
          throw new Error(
            "model microsoft-decision-1 requires OPENROUTER_API_KEY (or CLAWQL_DECISIONS_OPENROUTER_API_KEY)"
          );
        },
      })
    );
    expect("error" in report).toBe(false);
    if ("error" in report) return;
    expect(report.verdict.productionTrustedClaim).toBe(false);
    expect(report.flipRate.skipped).toBe(true);
    expect(report.flipRate.passed).toBe(false);
    expect(report.honesty.some((h) => /OPENROUTER_API_KEY/i.test(h))).toBe(true);
    expect(report.bulk.costSource).toBe("explicit");
  });

  it("passes spend_ledger costSource and spendCosts into fan-out bulk", async () => {
    const spendCosts = new Map<string, number>([
      ["clawql", 0],
      ["microsoft/microsoft-decision-1", 0.002],
    ]);
    let seenCostSource: string | undefined;
    let seenSpend: ReadonlyMap<string, number> | undefined;
    let d1Cost: number | undefined;
    const report = await Effect.runPromise(
      buildDecision1CandidateReport({
        suite,
        spendCosts,
        decision1CostPerCase: 0.05,
        runBulk: async (req) => {
          seenCostSource = req.costSource;
          seenSpend = req.spendCosts;
          d1Cost = req.backends.find(
            (b) => b.id === "openrouter/microsoft/microsoft-decision-1"
          )?.costPerCase;
          return {
            object: "clawql.decision.fanout_eval",
            mode: "bulk",
            matchMode: "twin",
            reports: [],
            disagreements: [],
            reviewCount: 0,
            traceId: "t",
            caseCount: 1,
          };
        },
        runFlip: async () => ({
          object: "clawql.decision.flip_rate",
          maxFlipRate: 0.1,
          families: ["whitespace"],
          caseCount: 1,
          totalPerturbations: 1,
          passed: true,
          reports: [],
          traceId: "f",
          backendId: "openrouter/microsoft/microsoft-decision-1",
          model: "microsoft/microsoft-decision-1",
        }),
      })
    );
    expect("error" in report).toBe(false);
    if ("error" in report) return;
    expect(seenCostSource).toBe("spend_ledger");
    expect(seenSpend?.get("microsoft/microsoft-decision-1")).toBe(0.002);
    expect(d1Cost).toBe(0.05);
    expect(report.bulk.costSource).toBe("spend_ledger");
    expect(report.verdict.productionTrustedClaim).toBe(false);
  });
});
