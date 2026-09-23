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
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          scores: [
            { id: "tool.a", confidence: 0.91 },
            { id: "tool.b", confidence: 0.12 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as unknown as typeof fetch;

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
  });
});
