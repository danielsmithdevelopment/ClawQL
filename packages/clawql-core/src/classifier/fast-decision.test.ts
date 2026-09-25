/**
 * Fast Decision Primitive tests — registry, skill fast-path, SGDOP prefilter,
 * pre-compaction cache, §7 calibration gate.
 */

import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  applySgdopPeerPrefilter,
  BUILTIN_FAST_DECISION_USE_SITES,
  decideSkillFastPath,
  evaluateCorrectnessAndCalibration,
  FastDecisionRegistry,
  FastDecisionTestStackLive,
  FastDecisionValidationService,
  runFastDecision,
  runPreCompactionOntologyCacheCheck,
  seedBuiltinUseSites,
  SkillValidityStore,
  StableCacheBlockService,
} from "./index.js";
import { makeCapturingWormLayer } from "../plugin/worm-sink.js";

function testLayer(capture = makeCapturingWormLayer()) {
  return {
    layer: Layer.mergeAll(FastDecisionTestStackLive, capture.layer),
    capture,
  };
}

describe("Fast Decision Primitive", () => {
  it("seeds nine built-in use sites", async () => {
    const { layer } = testLayer();
    const ids = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        const registry = yield* FastDecisionRegistry;
        const list = yield* registry.list();
        return list.map((s) => s.useSiteId).sort();
      }).pipe(Effect.provide(layer))
    );
    expect(ids).toHaveLength(9);
    expect(ids).toEqual([...BUILTIN_FAST_DECISION_USE_SITES.map((s) => s.useSiteId)].sort());
  });

  it("selects above-threshold candidate and writes WORM attempted + above", async () => {
    const { layer, capture } = testLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        return yield* runFastDecision("search_provider_tool_routing", {
          sessionId: "s1",
          query: "github merge pull",
          extras: {
            providerToolCandidates: [
              {
                candidateId: "github.pulls.merge",
                features: { label: "github merge pull request", priorConfidence: 0.92 },
              },
              {
                candidateId: "slack.chat.post",
                features: { label: "slack post message", priorConfidence: 0.1 },
              },
            ],
          },
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.outcome).toBe("above_threshold");
    expect(result.selectedCandidateId).toBe("github.pulls.merge");
    const events = await Effect.runPromise(capture.events());
    const types = events.map((e) => e.type);
    expect(types).toContain("FAST_DECISION_ATTEMPTED");
    expect(types).toContain("FAST_DECISION_ABOVE_THRESHOLD");
  });

  it("falls back below threshold", async () => {
    const { layer } = testLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        return yield* runFastDecision("search_provider_tool_routing", {
          sessionId: "s1",
          extras: {
            providerToolCandidates: [
              {
                candidateId: "weak",
                features: { priorConfidence: 0.2 },
              },
            ],
          },
        });
      }).pipe(Effect.provide(layer))
    );
    expect(result.outcome).toBe("below_threshold_fallback");
    expect(result.selectedCandidateId).toBeUndefined();
  });
});

describe("skill fast path", () => {
  it("takes slow path when skill is rolled_back even if confidence is high", async () => {
    const { layer, capture } = testLayer();
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        const validity = yield* SkillValidityStore;
        yield* validity.setStatus("skill.extract-lien", "rolled_back");
        return yield* decideSkillFastPath({
          sessionId: "s1",
          query: "extract springing lien",
          extras: {
            skillCandidates: [
              {
                candidateId: "skill.extract-lien",
                features: { label: "extract springing lien", priorConfidence: 0.95 },
              },
            ],
          },
        });
      }).pipe(Effect.provide(layer))
    );

    expect(decision.path).toBe("slow");
    if (decision.path === "slow") {
      expect(decision.reason).toBe("stale_or_rolled_back");
    }
    const events = await Effect.runPromise(capture.events());
    expect(events.map((e) => e.type)).toContain("SKILL_FAST_PATH_REJECTED_STALE_SKILL");
  });

  it("takes fast path only when accepted + above threshold", async () => {
    const { layer } = testLayer();
    const decision = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        const validity = yield* SkillValidityStore;
        yield* validity.setStatus("skill.ok", "accepted");
        return yield* decideSkillFastPath({
          sessionId: "s1",
          extras: {
            skillCandidates: [
              {
                candidateId: "skill.ok",
                features: { priorConfidence: 0.95 },
              },
            ],
          },
        });
      }).pipe(Effect.provide(layer))
    );
    expect(decision).toEqual({
      path: "fast",
      skillId: "skill.ok",
      confidence: 0.95,
      validityStatus: "accepted",
    });
  });
});

describe("sgdop peer prefilter", () => {
  it("includes high/medium peers (FN-biased) and never claims final recruitment", async () => {
    const { layer } = testLayer();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        return yield* applySgdopPeerPrefilter({ sessionId: "swarm-1" }, [
          { peerId: "a", priorBucket: "high" },
          { peerId: "b", priorBucket: "medium" },
          { peerId: "c", priorBucket: "low" },
        ]);
      }).pipe(Effect.provide(layer))
    );
    expect(result.isFinalRecruitmentDecision).toBe(false);
    expect(result.includedPeerIds).toContain("a");
    expect(result.includedPeerIds).toContain("b");
    expect(result.excludedPeerIds).toContain("c");
  });
});

describe("pre-compaction ontology cache check", () => {
  it("appends load-bearing entries to append-only stable block", async () => {
    const { layer } = testLayer();
    const { check, items } = await Effect.runPromise(
      Effect.gen(function* () {
        yield* seedBuiltinUseSites();
        const check = yield* runPreCompactionOntologyCacheCheck({ sessionId: "s1" }, [
          {
            entryId: "h1",
            summary: "found lien clause",
            loadBearingPrior: 0.9,
            extractedFact: "has_springing_lien=true",
            justification: "matched Layer 1 field",
          },
          {
            entryId: "h2",
            summary: "noise",
            loadBearingPrior: 0.1,
          },
        ]);
        const stable = yield* StableCacheBlockService;
        const items = yield* stable.list();
        expect(stable.isEligibleForCompactionPrune()).toBe(false);
        return { check, items };
      }).pipe(Effect.provide(layer))
    );

    expect(check.compactionPermitted).toBe(true);
    expect(check.cached).toContain("h1");
    expect(check.skipped).toContain("h2");
    expect(items.length).toBe(1);
    expect(items[0]?.fact).toBe("has_springing_lien=true");
  });

  it("rejects in-place overwrite on stable cache (append-only)", async () => {
    const { layer } = testLayer();
    const second = await Effect.runPromise(
      Effect.gen(function* () {
        const stable = yield* StableCacheBlockService;
        yield* stable.append({ id: "x", fact: "one" });
        return yield* stable.append({ id: "x", fact: "two" });
      }).pipe(Effect.provide(layer))
    );
    expect(second.ok).toBe(false);
  });
});

describe("§7 correctness + calibration gate", () => {
  it("passes when accuracy and calibration are within criteria", async () => {
    const report = evaluateCorrectnessAndCalibration("skill_fast_path_match", [
      {
        caseId: "1",
        groundTruthCandidateId: "a",
        scores: [
          { candidateId: "a", confidence: 0.92 },
          { candidateId: "b", confidence: 0.1 },
        ],
      },
      {
        caseId: "2",
        groundTruthCandidateId: "a",
        scores: [{ candidateId: "a", confidence: 0.88 }],
      },
    ]);
    expect(report.passed).toBe(true);
    expect(report.rawAccuracy).toBe(1);
  });

  it("fails overconfident wrong answers (poor calibration)", async () => {
    const { layer } = testLayer();
    const report = await Effect.runPromise(
      Effect.gen(function* () {
        const validation = yield* FastDecisionValidationService;
        return yield* validation.evaluate("field_to_schema_mapping", [
          {
            caseId: "bad",
            groundTruthCandidateId: "correct",
            scores: [{ candidateId: "wrong", confidence: 0.95 }],
          },
        ]);
      }).pipe(Effect.provide(layer))
    );
    expect(report.passed).toBe(false);
    expect(report.rawAccuracy).toBe(0);
  });

  it("abstains on all-zero confidences instead of inventing accuracy from fixture order", () => {
    const report = evaluateCorrectnessAndCalibration("skill_fast_path_match", [
      {
        caseId: "z1",
        groundTruthCandidateId: "hit",
        scores: [
          { candidateId: "hit", confidence: 0 },
          { candidateId: "miss", confidence: 0 },
        ],
      },
    ]);
    expect(report.passed).toBe(false);
    expect(report.rawAccuracy).toBe(0);
    expect(report.meanCalibrationError).toBe(1);
    expect(report.failureReasons.some((r) => r.includes("zeroSignalAbstain"))).toBe(true);
    expect(report.failureReasons.some((r) => r.includes("noCalibratableScores"))).toBe(true);
  });
});

describe("GLiNER2 primary scorer", () => {
  it("defaults to gliner2-stub without sidecar URL", async () => {
    const prev = process.env.CLAWQL_FAST_DECISION_GLINER_URL;
    delete process.env.CLAWQL_FAST_DECISION_GLINER_URL;
    const { createGlinerFastDecisionScorerLayer, FastDecisionScorer } = await import("./scorer.js");
    const layer = createGlinerFastDecisionScorerLayer();
    const id = await Effect.runPromise(
      Effect.gen(function* () {
        const scorer = yield* FastDecisionScorer;
        return scorer.backendId();
      }).pipe(Effect.provide(layer))
    );
    expect(id).toBe("gliner2-stub");
    if (prev !== undefined) process.env.CLAWQL_FAST_DECISION_GLINER_URL = prev;
  });

  it("uses live HTTP classify when endpoint configured", async () => {
    const { createGlinerFastDecisionScorerLayer, FastDecisionScorer } = await import("./scorer.js");
    let capturedBody: unknown;
    const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          scores: [
            { id: "tool.a", confidence: 0.91 },
            { id: "tool.b", confidence: 0.12 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const layer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "fastino/gliner2.5-base-v1",
        timeoutMs: 1000,
      },
      fetchImpl,
    });

    const { backendId, scores } = await Effect.runPromise(
      Effect.gen(function* () {
        const scorer = yield* FastDecisionScorer;
        const scored = yield* scorer.score({
          useSiteId: "search_provider_tool_routing",
          ctx: { sessionId: "s1", query: "read a file" },
          taskFraming: "Which provider/tool is relevant to a query",
          candidates: [
            { candidateId: "tool.a", features: { description: "read files" } },
            { candidateId: "tool.b", features: { description: "send email" } },
          ],
        });
        return { backendId: scorer.backendId(), scores: scored };
      }).pipe(Effect.provide(layer))
    );

    expect(backendId).toBe("gliner2");
    expect(scores[0]?.candidateId).toBe("tool.a");
    expect(scores[0]?.confidence).toBeCloseTo(0.91);
    expect(capturedBody).toMatchObject({
      text: "read a file\n\nTask: Which provider/tool is relevant to a query",
      useSiteId: "search_provider_tool_routing",
    });
  });

  it("does not claim gliner2 backendId when sidecar HTTP fails", async () => {
    const { createGlinerFastDecisionScorerLayer, FastDecisionScorer } = await import("./scorer.js");
    const layer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.down",
        modelId: "fastino/gliner2.5-base-v1",
        timeoutMs: 500,
      },
      fetchImpl: (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
    });

    const backendId = await Effect.runPromise(
      Effect.gen(function* () {
        const scorer = yield* FastDecisionScorer;
        yield* scorer.score({
          useSiteId: "skill_fast_path_match",
          ctx: { sessionId: "s", query: "extract springing lien" },
          candidates: [
            { candidateId: "a", features: { description: "extract springing lien" } },
            { candidateId: "b", features: { description: "slack" } },
          ],
        });
        return scorer.backendId();
      }).pipe(Effect.provide(layer))
    );

    expect(backendId).toBe("gliner2-http-fallback-heuristic");
  });
});

describe("§7 held-out suite runner", () => {
  it("runs embedded suite and keeps productionTrusted false until adjudicated", async () => {
    const { HeuristicFastDecisionScorerLive } = await import("./scorer.js");
    const { defaultHeldOutSuite, runHeldOutValidationSuite } = await import("./held-out/index.js");

    const suite = defaultHeldOutSuite();
    expect(suite.cases.every((c) => c.adjudicated === false)).toBe(true);

    const reports = await Effect.runPromise(
      runHeldOutValidationSuite(suite).pipe(Effect.provide(HeuristicFastDecisionScorerLive))
    );

    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      expect(r.productionTrusted).toBe(false);
      expect(r.failureReasons.some((x) => x.includes("adjudication incomplete"))).toBe(true);
      expect(r.caseCount).toBeGreaterThan(0);
    }
  });

  it("loads Harvey v0.2 suite with provisional GT covering Lab workflow sites", async () => {
    const { harveyHeldOutSuiteV02, resolveHeldOutSuite, casesForUseSite } =
      await import("./held-out/index.js");
    const suite = harveyHeldOutSuiteV02();
    expect(suite.suiteId).toBe("fast-decision-held-out-v0.2-harvey");
    expect(suite.cases.length).toBeGreaterThanOrEqual(20);
    expect(suite.cases.every((c) => c.adjudicated === false)).toBe(true);
    expect(resolveHeldOutSuite("v0.2-harvey").suiteId).toBe(suite.suiteId);
    expect(casesForUseSite(suite, "search_provider_tool_routing").length).toBeGreaterThanOrEqual(5);
    for (const c of suite.cases) {
      expect(c.candidates.some((x) => x.candidateId === c.groundTruthCandidateId)).toBe(true);
    }
  });

  it("loads frozen v0.3 routing-fresh suite (catalog-only draft)", async () => {
    const { routingFreshHeldOutSuiteV03, resolveHeldOutSuite, casesForUseSite } =
      await import("./held-out/index.js");
    const suite = routingFreshHeldOutSuiteV03();
    expect(suite.suiteId).toBe("fast-decision-held-out-v0.3-routing-fresh");
    expect(suite.cases.length).toBeGreaterThanOrEqual(28);
    expect(suite.cases.every((c) => c.adjudicated === false)).toBe(true);
    expect(suite.cases.every((c) => c.useSiteId === "search_provider_tool_routing")).toBe(true);
    expect(resolveHeldOutSuite("v0.3-routing-fresh").suiteId).toBe(suite.suiteId);
    expect(casesForUseSite(suite, "search_provider_tool_routing").length).toBe(suite.cases.length);
    for (const c of suite.cases) {
      expect(c.candidates.some((x) => x.candidateId === c.groundTruthCandidateId)).toBe(true);
    }
  });

  it("loads ClawQL capability ontology and enriches classify text with whenToUse", async () => {
    const { loadClawqlCapabilityOntology, lookupCapability, indexCapabilityOntology } =
      await import("./capability-ontology.js");
    const {
      composeOntologyEnrichedClassifyText,
      enrichCandidateDescription,
      enrichFastDecisionRequest,
      buildOntologyEnrichedClassifyPayload,
    } = await import("./ontology-enrichment.js");
    const ontology = loadClawqlCapabilityOntology();
    expect(ontology.ontologyId).toContain("clawql-capability");
    expect(ontology.capabilities.length).toBeGreaterThanOrEqual(20);
    expect(ontology.capabilities.some((c) => c.kind === "skill")).toBe(true);
    const index = indexCapabilityOntology(ontology);
    expect(lookupCapability(index, "mcp.data_query")?.ontologyRole).toBe("structured_query");
    expect(lookupCapability(index, "tool.bash_grep_hunt")?.kind).toBe("anti_pattern");
    expect(lookupCapability(index, "skill.clawql-vault-memory")?.kind).toBe("skill");
    const text = composeOntologyEnrichedClassifyText({
      query: "How many credit facilities mention springing lien?",
      taskFraming: "Which tool is relevant",
      ontology,
      candidateIds: ["mcp.data_query", "tool.bash_grep_hunt"],
    });
    expect(text).toContain("needs_structured_corpus");
    expect(text).toMatch(/ANTI_PATTERN|anti_pattern/i);
    expect(text.toLowerCase()).toContain("springing");
    const baitDesc = enrichCandidateDescription(
      {
        candidateId: "tool.bash_grep_hunt",
        features: {
          label: "grep springing lien /workspace",
          description: "Blind grep path=/workspace pattern springing lien",
        },
      },
      ontology
    );
    expect(baitDesc).toMatch(/ANTI_PATTERN/i);
    expect(baitDesc.toLowerCase()).not.toContain("path=/workspace");
    expect(baitDesc.toLowerCase()).not.toMatch(/blind grep/);
    const sqlDesc = enrichCandidateDescription(
      {
        candidateId: "mcp.data_query",
        features: { label: "data_query", description: "SQL over DuckDB" },
      },
      ontology
    );
    expect(sqlDesc).toContain("STRUCTURED_CORPUS_PREFERRED");
    expect(sqlDesc).toContain("whenToUse");
    const enriched = enrichFastDecisionRequest({
      ctx: { sessionId: "t", query: "list HSR second requests" },
      candidates: [
        { candidateId: "mcp.memory_recall", features: { label: "memory_recall" } },
        { candidateId: "tool.bash_grep_hunt", features: { label: "bash" } },
      ],
      ontology,
    });
    expect(enriched.ctx.extras?.ontologyBrief).toEqual(expect.any(String));
    expect(String(enriched.candidates[0]?.features.description)).toContain("whenToUse");
    const withOnt = buildOntologyEnrichedClassifyPayload({
      useSiteId: "search_provider_tool_routing",
      query: "springing lien cohort",
      candidates: [
        {
          candidateId: "tool.bash_grep_hunt",
          features: { description: "grep springing lien across DMS" },
        },
        { candidateId: "mcp.data_query", features: { label: "data_query" } },
      ],
      ontology,
    });
    const withoutOnt = buildOntologyEnrichedClassifyPayload({
      useSiteId: "search_provider_tool_routing",
      query: "springing lien cohort",
      candidates: [
        {
          candidateId: "tool.bash_grep_hunt",
          features: { description: "grep springing lien across DMS" },
        },
        { candidateId: "mcp.data_query", features: { label: "data_query" } },
      ],
    });
    expect(withOnt.text).not.toBe(withoutOnt.text);
    expect(withOnt.labels[0]?.description).not.toBe(withoutOnt.labels[0]?.description);
  });

  it("marks productionTrusted only with live adjudicationKind + live gliner2 scorer", async () => {
    const { createGlinerFastDecisionScorerLayer } = await import("./scorer.js");
    const { runHeldOutValidationForUseSite } = await import("./held-out/index.js");
    const suite = {
      suiteId: "adj",
      description: "adjudicated fixture",
      cases: [
        {
          caseId: "a1",
          useSiteId: "skill_fast_path_match",
          query: "x",
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
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            scores: [
              { id: "hit", confidence: 0.95 },
              { id: "miss", confidence: 0.1 },
            ],
            backend: "gliner2:test",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as unknown as typeof fetch,
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
    expect(report.productionTrusted).toBe(true);
  });

  it("adjudicated without adjudicationKind cannot light productionTrusted", async () => {
    const { createGlinerFastDecisionScorerLayer } = await import("./scorer.js");
    const { runHeldOutValidationForUseSite } = await import("./held-out/index.js");
    const suite = {
      suiteId: "missing-kind",
      description: "adjudicated:true alone is insufficient",
      cases: [
        {
          caseId: "m1",
          useSiteId: "skill_fast_path_match",
          query: "x",
          candidates: [
            { candidateId: "hit", features: { priorConfidence: 0.95 } },
            { candidateId: "miss", features: { priorConfidence: 0.1 } },
          ],
          groundTruthCandidateId: "hit",
          adjudicated: true,
        },
      ],
    };
    const glinerLayer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            scores: [
              { id: "hit", confidence: 0.95 },
              { id: "miss", confidence: 0.1 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as unknown as typeof fetch,
    });
    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(suite, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(glinerLayer))
    );
    expect(report.passedCriteria).toBe(true);
    expect(report.productionTrusted).toBe(false);
    expect(report.failureReasons.some((x) => x.includes("live frontier adjudication"))).toBe(true);
  });

  it("prior-confidence scorer cannot light productionTrusted even with live labels", async () => {
    const { PriorConfidenceScorerLive } = await import("./scorer.js");
    const { runHeldOutValidationForUseSite } = await import("./held-out/index.js");
    const suite = {
      suiteId: "prior-not-gliner",
      description: "prior scorer is not live gliner2",
      cases: [
        {
          caseId: "p1",
          useSiteId: "skill_fast_path_match",
          query: "x",
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
    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(suite, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(PriorConfidenceScorerLive))
    );
    expect(report.passedCriteria).toBe(true);
    expect(report.scorerBackend).toBe("prior-confidence");
    expect(report.productionTrusted).toBe(false);
    expect(report.failureReasons.some((x) => x.includes("not live gliner2"))).toBe(true);
  });

  it("dry-run adjudication never lights productionTrusted even when criteria pass", async () => {
    const { PriorConfidenceScorerLive } = await import("./scorer.js");
    const {
      adjudicateHeldOutSuite,
      applyAdjudicationLabels,
      runHeldOutValidationForUseSite,
      DryRunFrontierAdjudicatorLive,
    } = await import("./held-out/index.js");

    const suite = {
      suiteId: "dry-run-adj",
      description: "dry-run must not light productionTrusted",
      cases: [
        {
          caseId: "d1",
          useSiteId: "skill_fast_path_match",
          query: "x",
          candidates: [
            { candidateId: "hit", features: { priorConfidence: 0.95 } },
            { candidateId: "miss", features: { priorConfidence: 0.1 } },
          ],
          groundTruthCandidateId: "hit",
          adjudicated: false,
        },
      ],
    };

    const adj = await Effect.runPromise(
      adjudicateHeldOutSuite(suite).pipe(Effect.provide(DryRunFrontierAdjudicatorLive))
    );
    expect(adj.mode).toBe("dry-run");
    const labeled = applyAdjudicationLabels(suite, adj.labels);
    expect(labeled.cases[0]?.adjudicated).toBe(true);
    expect(labeled.cases[0]?.adjudicationKind).toBe("dry-run");

    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(labeled, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(PriorConfidenceScorerLive))
    );
    expect(report.passedCriteria).toBe(true);
    expect(report.productionTrusted).toBe(false);
    expect(report.failureReasons.some((x) => x.includes("live frontier adjudication"))).toBe(true);
  });

  it("parseLiveAdjudicationLabels refuses dry-run provenance", async () => {
    const { parseLiveAdjudicationLabels } = await import("./held-out/index.js");
    expect(() =>
      parseLiveAdjudicationLabels({
        labels: [
          {
            caseId: "x",
            groundTruthCandidateId: "hit",
            adjudicated: true,
            judgeModel: "dry-run-recorded",
            judgedAt: new Date().toISOString(),
            rationale: "nope",
          },
        ],
      })
    ).toThrow(/refusing dry-run/);
  });

  it("labels-in path + live gliner2 can light productionTrusted", async () => {
    const { createGlinerFastDecisionScorerLayer } = await import("./scorer.js");
    const { applyAdjudicationLabels, parseLiveAdjudicationLabels, runHeldOutValidationForUseSite } =
      await import("./held-out/index.js");

    const labels = parseLiveAdjudicationLabels({
      labels: [
        {
          caseId: "a1",
          groundTruthCandidateId: "hit",
          adjudicated: true,
          judgeModel: "claude-sonnet-4-6",
          judgedAt: new Date().toISOString(),
          rationale: "fixture live label",
        },
      ],
    });
    const suite = {
      suiteId: "labels-in",
      description: "labels-in",
      cases: [
        {
          caseId: "a1",
          useSiteId: "skill_fast_path_match",
          query: "x",
          candidates: [
            { candidateId: "hit", features: { priorConfidence: 0.95 } },
            { candidateId: "miss", features: { priorConfidence: 0.1 } },
          ],
          groundTruthCandidateId: "miss",
          adjudicated: false,
        },
      ],
    };
    const labeled = applyAdjudicationLabels(suite, labels);
    expect(labeled.cases[0]?.adjudicationKind).toBe("live");
    expect(labeled.cases[0]?.groundTruthCandidateId).toBe("hit");

    const glinerLayer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            scores: [
              { id: "hit", confidence: 0.95 },
              { id: "miss", confidence: 0.1 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as unknown as typeof fetch,
    });

    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(labeled, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(glinerLayer))
    );
    expect(report.scorerBackend).toBe("gliner2");
    expect(report.productionTrusted).toBe(true);
  });

  it("HTTP adjudicator + live gliner2 HTTP can light productionTrusted on a mini suite", async () => {
    const { createGlinerFastDecisionScorerLayer } = await import("./scorer.js");
    const {
      adjudicateHeldOutSuite,
      applyAdjudicationLabels,
      runHeldOutValidationForUseSite,
      makeHttpFrontierAdjudicator,
      FrontierAdjudicator,
    } = await import("./held-out/index.js");
    const { Layer } = await import("effect");

    const suite = {
      suiteId: "http-adj-mini",
      description: "mini suite for HTTP judge path",
      cases: [
        {
          caseId: "h1",
          useSiteId: "skill_fast_path_match",
          query: "pick hit",
          candidates: [
            { candidateId: "hit", features: { priorConfidence: 0.95 } },
            { candidateId: "miss", features: { priorConfidence: 0.05 } },
          ],
          groundTruthCandidateId: "miss", // wrong provisional — judge corrects
          adjudicated: false,
        },
      ],
    };

    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          groundTruthCandidateId: "hit",
          rationale: "recorded judge fixture",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as unknown as typeof fetch;

    const judgeLayer = Layer.succeed(
      FrontierAdjudicator,
      makeHttpFrontierAdjudicator({
        url: "http://judge.test/v1/adjudicate",
        model: "test-judge",
        fetchImpl,
      })
    );

    const adj = await Effect.runPromise(
      adjudicateHeldOutSuite(suite).pipe(Effect.provide(judgeLayer))
    );
    expect(adj.mode).toBe("live");
    expect(adj.labels[0]?.groundTruthCandidateId).toBe("hit");

    const labeled = applyAdjudicationLabels(suite, adj.labels);
    expect(labeled.cases[0]?.adjudicationKind).toBe("live");

    const glinerLayer = createGlinerFastDecisionScorerLayer({
      config: {
        endpointUrl: "http://gliner.test",
        modelId: "test-gliner",
        timeoutMs: 2000,
      },
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            scores: [
              { id: "hit", confidence: 0.95 },
              { id: "miss", confidence: 0.05 },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )) as unknown as typeof fetch,
    });

    const report = await Effect.runPromise(
      runHeldOutValidationForUseSite(labeled, "skill_fast_path_match", {
        minAccuracy: 0.7,
        maxMeanCalibrationError: 0.2,
        minCases: 1,
      }).pipe(Effect.provide(glinerLayer))
    );
    expect(report.scorerBackend).toBe("gliner2");
    expect(report.productionTrusted).toBe(true);
  });
});
