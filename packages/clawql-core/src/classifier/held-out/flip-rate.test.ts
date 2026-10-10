/**
 * Held-out flip-rate gate — deterministic perturbations + FastDecisionScorer.
 */

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { createGlinerFastDecisionScorerLayer } from "../scorer.js";
import {
  applyQueryPerturbations,
  evaluateHeldOutFlipRate,
  readFlipRateGateEnabledFromEnv,
} from "./flip-rate.js";
import { runHeldOutValidationForUseSite } from "./run-held-out.js";

afterEach(() => {
  delete process.env.CLAWQL_FLIP_RATE_GATE;
});

describe("applyQueryPerturbations", () => {
  it("applies deterministic families and drops no-ops", async () => {
    const out = await Effect.runPromise(
      applyQueryPerturbations("I was charged twice for my order.")
    );
    expect(out.some((p) => p.family === "whitespace" && p.label === "pad")).toBe(true);
    expect(out.some((p) => p.family === "case" && p.label === "upper")).toBe(true);
    expect(out.some((p) => p.family === "synonym")).toBe(true);
    expect(out.every((p) => p.query.length > 0)).toBe(true);
  });
});

describe("evaluateHeldOutFlipRate", () => {
  const cases = [
    {
      caseId: "billing-1",
      useSiteId: "skill_fast_path_match",
      query: "I was charged twice for my order.",
      candidates: [
        { candidateId: "billing", features: { priorConfidence: 0.9 } },
        { candidateId: "shipping", features: { priorConfidence: 0.1 } },
      ],
      groundTruthCandidateId: "billing",
      adjudicated: true,
      adjudicationKind: "live" as const,
    },
  ];

  it("passes when scorer is stable under perturbations", async () => {
    const layer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      calibration: { enabled: false, mode: "none", temperature: 1 },
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            scores: [
              { id: "billing", confidence: 0.9 },
              { id: "shipping", confidence: 0.1 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as unknown as typeof fetch,
    });
    const report = await Effect.runPromise(
      evaluateHeldOutFlipRate(cases).pipe(Effect.provide(layer))
    );
    expect(report.skipped).toBe(false);
    expect(report.passed).toBe(true);
    expect(report.reports[0]?.baseline).toBe("billing");
    expect(report.reports[0]?.flipRate).toBe(0);
  });

  it("fails when synonym perturbation flips the top candidate", async () => {
    const layer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      calibration: { enabled: false, mode: "none", temperature: 1 },
      fetchImpl: (async (_input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        const billed = /billed/i.test(body);
        return new Response(
          JSON.stringify({
            scores: billed
              ? [
                  { id: "shipping", confidence: 0.9 },
                  { id: "billing", confidence: 0.1 },
                ]
              : [
                  { id: "billing", confidence: 0.9 },
                  { id: "shipping", confidence: 0.1 },
                ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as unknown as typeof fetch,
    });
    const report = await Effect.runPromise(
      evaluateHeldOutFlipRate(cases, { maxFlipRate: 0.1 }).pipe(Effect.provide(layer))
    );
    expect(report.passed).toBe(false);
    expect(report.reports[0]?.flips).toBeGreaterThan(0);
  });

  it("skips when CLAWQL_FLIP_RATE_GATE=0", async () => {
    process.env.CLAWQL_FLIP_RATE_GATE = "0";
    expect(readFlipRateGateEnabledFromEnv()).toBe(false);
    const layer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      calibration: { enabled: false, mode: "none", temperature: 1 },
      fetchImpl: (async () =>
        new Response(JSON.stringify({ scores: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch,
    });
    const report = await Effect.runPromise(
      evaluateHeldOutFlipRate(cases).pipe(Effect.provide(layer))
    );
    expect(report.skipped).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.reports).toEqual([]);
  });
});

describe("productionTrusted flip-rate coupling", () => {
  it("blocks productionTrusted when flip-rate fails under live gliner2", async () => {
    const suite = {
      suiteId: "flip-block",
      description: "flip-rate must gate trust",
      cases: [
        {
          caseId: "f1",
          useSiteId: "skill_fast_path_match",
          query: "I was charged twice for my order.",
          candidates: [
            { candidateId: "hit", features: { priorConfidence: 0.95 } },
            { candidateId: "miss", features: { priorConfidence: 0.1 } },
          ],
          groundTruthCandidateId: "hit",
          adjudicated: true,
          adjudicationKind: "live" as const,
        },
      ],
    };
    const glinerLayer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      calibration: { enabled: false, mode: "none", temperature: 1 },
      fetchImpl: (async (_input, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        const billed = /billed/i.test(body);
        return new Response(
          JSON.stringify({
            scores: billed
              ? [
                  { id: "miss", confidence: 0.95 },
                  { id: "hit", confidence: 0.1 },
                ]
              : [
                  { id: "hit", confidence: 0.95 },
                  { id: "miss", confidence: 0.1 },
                ],
            backend: "gliner2:test",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) as unknown as typeof fetch,
    });
    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(suite, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(glinerLayer))
    );
    expect(report.passedCriteria).toBe(true);
    expect(report.scorerBackend).toBe("gliner2");
    expect(report.flipRate.passed).toBe(false);
    expect(report.productionTrusted).toBe(false);
    expect(report.failureReasons.some((x) => x.includes("flip-rate gate failed"))).toBe(true);
  });
});
