/**
 * §7 held-out runner — score cases via FastDecisionScorer, then correctness/calibration.
 * productionTrusted stays false until every case is live-frontier-adjudicated,
 * the scorer backend is live `gliner2`, AND criteria pass.
 */

import { readFileSync } from "node:fs";
import { Context, Effect, Layer } from "effect";
import { FastDecisionScorer } from "../scorer.js";
import type { FastDecisionContext } from "../types.js";
import { BUILTIN_FAST_DECISION_USE_SITES } from "../use-sites/builtins.js";
import {
  DEFAULT_VALIDATION_CRITERIA,
  evaluateCorrectnessAndCalibration,
  type ValidationCriteria,
} from "../validation.js";
import {
  FAST_DECISION_HELD_OUT_V01,
  harveyHeldOutSuiteV02,
  routingFreshHeldOutSuiteV03,
  routingFreshHeldOutSuiteV04,
  routingFreshHeldOutSuiteV05,
} from "./fixtures.js";
import type {
  HeldOutCaseSpec,
  HeldOutSuiteManifest,
  HeldOutValidationRunReport,
  ScoredHeldOutCase,
} from "./types.js";
import { candidatesEquivalent } from "../candidate-equivalence.js";
import { loadClawqlCapabilityOntology } from "../capability-ontology.js";
import { enrichFastDecisionRequest } from "../ontology-enrichment.js";

/** Only live GLiNER2 HTTP success lights the productionTrusted scorer gate. */
export const PRODUCTION_TRUSTED_SCORER_BACKEND = "gliner2";

/** Named suites selectable via `--suite` / resolveHeldOutSuite. */
export type HeldOutSuiteName =
  | "v0.1"
  | "v0.2-harvey"
  | "v0.3-routing-fresh"
  | "v0.4-routing-fresh"
  | "v0.5-routing-fresh";

const BUILTIN_TASK_FRAMING: ReadonlyMap<string, string> = new Map(
  BUILTIN_FAST_DECISION_USE_SITES.map((s) => [s.useSiteId, s.description])
);

export function taskFramingForUseSite(useSiteId: string): string | undefined {
  return BUILTIN_TASK_FRAMING.get(useSiteId);
}

function isDefaultValidationCriteria(c: ValidationCriteria): boolean {
  return (
    c.minAccuracy === DEFAULT_VALIDATION_CRITERIA.minAccuracy &&
    c.maxMeanCalibrationError === DEFAULT_VALIDATION_CRITERIA.maxMeanCalibrationError &&
    c.minCases === DEFAULT_VALIDATION_CRITERIA.minCases
  );
}

export function defaultHeldOutSuite(): HeldOutSuiteManifest {
  return FAST_DECISION_HELD_OUT_V01;
}

/**
 * Resolve a named suite or filesystem path.
 * - `v0.1` / omitted → synthetic wiring suite
 * - `v0.2-harvey` → Harvey LAB workflow suite
 * - `v0.3-routing-fresh` → frozen catalog-only routing suite (spent for τ/hints)
 * - `v0.4-routing-fresh` → frozen final-eval routing suite (three-set protocol)
 * - `v0.5-routing-fresh` → frozen Decide-vs-stock final-eval suite (n=75)
 * - other string → JSON path via loadHeldOutSuite
 */
export function resolveHeldOutSuite(nameOrPath?: string): HeldOutSuiteManifest {
  if (!nameOrPath || nameOrPath === "v0.1" || nameOrPath === "default") {
    return defaultHeldOutSuite();
  }
  if (nameOrPath === "v0.2-harvey" || nameOrPath === "harvey") {
    return harveyHeldOutSuiteV02();
  }
  if (
    nameOrPath === "v0.3-routing-fresh" ||
    nameOrPath === "routing-fresh" ||
    nameOrPath === "v0.3"
  ) {
    return routingFreshHeldOutSuiteV03();
  }
  if (
    nameOrPath === "v0.4-routing-fresh" ||
    nameOrPath === "routing-fresh-v0.4" ||
    nameOrPath === "v0.4"
  ) {
    return routingFreshHeldOutSuiteV04();
  }
  if (
    nameOrPath === "v0.5-routing-fresh" ||
    nameOrPath === "routing-fresh-v0.5" ||
    nameOrPath === "v0.5"
  ) {
    return routingFreshHeldOutSuiteV05();
  }
  return loadHeldOutSuite(nameOrPath);
}

/** Load suite from JSON path, or return the embedded v0.1 suite when path omitted. */
export function loadHeldOutSuite(path?: string): HeldOutSuiteManifest {
  if (!path) return defaultHeldOutSuite();
  const raw = JSON.parse(readFileSync(path, "utf8")) as HeldOutSuiteManifest;
  if (!raw.suiteId || !Array.isArray(raw.cases)) {
    throw new Error(`invalid held-out suite at ${path}`);
  }
  return raw;
}

export function casesForUseSite(
  suite: HeldOutSuiteManifest,
  useSiteId: string
): readonly HeldOutCaseSpec[] {
  return suite.cases.filter((c) => c.useSiteId === useSiteId);
}

function ctxForCase(c: HeldOutCaseSpec): FastDecisionContext {
  return {
    sessionId: `held-out:${c.caseId}`,
    query: c.query,
    extras: { heldOutCaseId: c.caseId, text: c.query },
  };
}

/**
 * Capability ontology enrichment for held-out / runtime scoring.
 *
 * Default **off** after clean v0.3 dual-arm (no evidence of routing benefit;
 * see ONTOLOGY_ENRICHMENT_EVAL_LOG.md). Opt in: CLAWQL_FAST_DECISION_ONTOLOGY=1.
 */
export function ontologyEnrichmentEnabled(): boolean {
  const v = process.env.CLAWQL_FAST_DECISION_ONTOLOGY?.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
  return false;
}

export function scoreHeldOutCases(
  cases: readonly HeldOutCaseSpec[]
): Effect.Effect<readonly ScoredHeldOutCase[], never, FastDecisionScorer> {
  return Effect.gen(function* () {
    const scorer = yield* FastDecisionScorer;
    const ontology = ontologyEnrichmentEnabled()
      ? yield* Effect.sync(() => {
          try {
            return loadClawqlCapabilityOntology();
          } catch {
            return undefined;
          }
        })
      : undefined;
    const out: ScoredHeldOutCase[] = [];
    for (const c of cases) {
      const baseCtx = ctxForCase(c);
      const enriched = ontology
        ? enrichFastDecisionRequest({
            ctx: baseCtx,
            candidates: c.candidates,
            ontology,
          })
        : { ctx: baseCtx, candidates: c.candidates };
      const scores = yield* scorer.score({
        useSiteId: c.useSiteId,
        ctx: enriched.ctx,
        candidates: enriched.candidates,
        taskFraming: taskFramingForUseSite(c.useSiteId),
        capabilityOntology: ontology,
      });
      const zeroSignal = scores.length > 0 && scores.every((s) => s.confidence <= 0);
      const top = zeroSignal
        ? undefined
        : [...scores].sort((a, b) => b.confidence - a.confidence)[0];
      out.push({
        caseId: c.caseId,
        useSiteId: c.useSiteId,
        groundTruthCandidateId: c.groundTruthCandidateId,
        adjudicated: c.adjudicated,
        adjudicationKind: c.adjudicationKind,
        scores,
        topCandidateId: top?.candidateId,
        topConfidence: top?.confidence,
        correct: Boolean(
          top && candidatesEquivalent(top.candidateId, c.groundTruthCandidateId)
        ),
      });
    }
    return out;
  });
}

export function runHeldOutValidationForUseSite(
  suite: HeldOutSuiteManifest,
  useSiteId: string,
  criteria: ValidationCriteria = DEFAULT_VALIDATION_CRITERIA
): Effect.Effect<HeldOutValidationRunReport, never, FastDecisionScorer> {
  return Effect.gen(function* () {
    const scorer = yield* FastDecisionScorer;
    const cases = casesForUseSite(suite, useSiteId);
    const scored = yield* scoreHeldOutCases(cases);
    const scorerBackend = scorer.backendId();
    const heldOutCases = scored.map((s) => ({
      caseId: s.caseId,
      groundTruthCandidateId: s.groundTruthCandidateId,
      scores: s.scores,
    }));
    const cal = evaluateCorrectnessAndCalibration(useSiteId, heldOutCases, criteria);
    // productionTrusted always uses DEFAULT production criteria — wiring criteria
    // (HELD_OUT_WIRING_CRITERIA) must not light the flag.
    const productionCal = isDefaultValidationCriteria(criteria)
      ? cal
      : evaluateCorrectnessAndCalibration(useSiteId, heldOutCases, DEFAULT_VALIDATION_CRITERIA);
    const adjudicatedCount = scored.filter((s) => s.adjudicated).length;
    const allAdjudicated = scored.length > 0 && adjudicatedCount === scored.length;
    const liveKindCount = scored.filter((s) => s.adjudicationKind === "live").length;
    const liveAdjudicated = allAdjudicated && liveKindCount === scored.length;
    const liveGliner = scorerBackend === PRODUCTION_TRUSTED_SCORER_BACKEND;
    const failureReasons = [...cal.failureReasons];
    if (!allAdjudicated) {
      failureReasons.push(
        `adjudication incomplete: ${adjudicatedCount}/${scored.length} cases frontier-adjudicated`
      );
    } else if (!liveAdjudicated) {
      failureReasons.push(
        `live frontier adjudication required for productionTrusted (live=${liveKindCount}/${scored.length}; dry-run or missing adjudicationKind does not count)`
      );
    }
    if (!liveGliner) {
      failureReasons.push(
        `scorer backend "${scorerBackend}" is not live ${PRODUCTION_TRUSTED_SCORER_BACKEND} (stub/fallback/heuristic/prior cannot light productionTrusted)`
      );
    }
    if (liveAdjudicated && liveGliner && !productionCal.passed) {
      for (const reason of productionCal.failureReasons) {
        const tagged = `productionTrusted criteria: ${reason}`;
        if (!failureReasons.includes(tagged) && !failureReasons.includes(reason)) {
          failureReasons.push(tagged);
        }
      }
    }
    return {
      suiteId: suite.suiteId,
      useSiteId,
      caseCount: scored.length,
      adjudicatedCount,
      rawAccuracy: cal.rawAccuracy,
      meanCalibrationError: cal.meanCalibrationError,
      passedCriteria: cal.passed,
      failureReasons,
      scorerBackend,
      productionTrusted: productionCal.passed && liveAdjudicated && liveGliner,
      cases: scored,
    };
  });
}

/** Wiring-friendly criteria — not a production gate. */
export const HELD_OUT_WIRING_CRITERIA: ValidationCriteria = {
  minAccuracy: 0.5,
  maxMeanCalibrationError: 0.5,
  minCases: 1,
};

export function runHeldOutValidationSuite(
  suite: HeldOutSuiteManifest = defaultHeldOutSuite(),
  criteria: ValidationCriteria = HELD_OUT_WIRING_CRITERIA
): Effect.Effect<readonly HeldOutValidationRunReport[], never, FastDecisionScorer> {
  return Effect.gen(function* () {
    const useSiteIds = [...new Set(suite.cases.map((c) => c.useSiteId))];
    const reports: HeldOutValidationRunReport[] = [];
    for (const useSiteId of useSiteIds) {
      reports.push(yield* runHeldOutValidationForUseSite(suite, useSiteId, criteria));
    }
    return reports;
  });
}

export class FastDecisionHeldOutRunner extends Context.Tag("clawql/FastDecisionHeldOutRunner")<
  FastDecisionHeldOutRunner,
  {
    readonly runSuite: (
      suite?: HeldOutSuiteManifest,
      criteria?: ValidationCriteria
    ) => Effect.Effect<readonly HeldOutValidationRunReport[]>;
  }
>() {}

export function makeFastDecisionHeldOutRunnerLive(): Layer.Layer<
  FastDecisionHeldOutRunner,
  never,
  FastDecisionScorer
> {
  return Layer.effect(
    FastDecisionHeldOutRunner,
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const scorerLayer = Layer.succeed(FastDecisionScorer, scorer);
      return {
        runSuite: (suite, criteria) =>
          runHeldOutValidationSuite(suite ?? defaultHeldOutSuite(), criteria).pipe(
            Effect.provide(scorerLayer)
          ),
      };
    })
  );
}
