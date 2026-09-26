#!/usr/bin/env npx tsx
/**
 * Fast-path threshold readout for search_provider_tool_routing (§9 FP-costly).
 *
 * Integrity:
 * - Temperature is the frozen T=3 (Harvey-fit); not re-tuned here.
 * - Primary τ selection uses Harvey **routing** cases ONLY.
 * - v0.3 is eval-only. Never enters τ selection.
 * - If no Harvey-routing τ meets the locked precision floor, do **not** fall back
 *   to a low-precision τ — report `selected: null` and evaluate the pre-existing
 *   builtin threshold (0.75) as the operational reference (not fit on v0.3).
 *
 * Locked selection rule (FP-costly / high threshold):
 *   Among τ ∈ grid with precision(τ) ≥ 0.90 and nAccepted ≥ 1 on Harvey routing,
 *   maximize coverage; ties → higher τ (stricter).
 *   If none qualify: selected = null (no shippable τ from this fit set).
 *
 * Usage:
 *   npx tsx scripts/overnight-routing-threshold-readout.mts
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { Effect } from "effect";
import {
  applyCalibrationToScores,
  type CalibrationTransform,
  type FastDecisionScore,
  type ScoredHeldOutCase,
} from "../packages/clawql-core/src/classifier/index.ts";

const OUT_DIR = process.env.OVERNIGHT_CALIB_OUT ?? "/opt/cursor/artifacts/overnight-calib";
mkdirSync(OUT_DIR, { recursive: true });

const FROZEN: CalibrationTransform = {
  mode: "temperature_softmax",
  temperature: 3,
};

const USE_SITE = "search_provider_tool_routing";
/** Pre-existing builtins.ts threshold — not chosen from v0.3. */
const BUILTIN_THRESHOLD = 0.75;
const MIN_PRECISION = 0.9;
const THRESHOLD_GRID = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.99];

/** FP-costly use sites (§9 / builtins) — secondary pooled probe only. */
const FP_COSTLY_SITES = new Set([
  "search_provider_tool_routing",
  "skill_fast_path_match",
  "ontology_vocabulary_term_match",
  "document_entity_type_classification",
  "field_to_schema_mapping",
  "pattern_consistency_check",
  "relationship_edge_classification",
  "streams_event_dispatch",
]);

type Row = {
  readonly threshold: number;
  readonly n: number;
  readonly nAccepted: number;
  readonly coverage: number;
  readonly nCorrectAccepted: number;
  readonly accuracyAmongAccepted: number | null;
  readonly nFalsePositive: number;
  readonly falsePositiveRateAmongAccepted: number | null;
};

function applyCalib(scored: readonly ScoredHeldOutCase[]): ScoredHeldOutCase[] {
  return scored.map((s) => {
    const scores = applyCalibrationToScores(s.scores as readonly FastDecisionScore[], FROZEN);
    const zero = scores.length > 0 && scores.every((x) => x.confidence <= 0);
    const top = zero ? undefined : [...scores].sort((a, b) => b.confidence - a.confidence)[0];
    return {
      ...s,
      scores,
      topCandidateId: top?.candidateId,
      topConfidence: top?.confidence,
      correct: Boolean(top && top.candidateId === s.groundTruthCandidateId),
    };
  });
}

function metricsAt(scored: readonly ScoredHeldOutCase[], threshold: number): Row {
  const n = scored.length;
  const accepted = scored.filter((s) => (s.topConfidence ?? 0) >= threshold);
  const nAccepted = accepted.length;
  const nCorrectAccepted = accepted.filter((s) => s.correct).length;
  const nFalsePositive = accepted.filter((s) => !s.correct).length;
  return {
    threshold,
    n,
    nAccepted,
    coverage: n === 0 ? 0 : nAccepted / n,
    nCorrectAccepted,
    accuracyAmongAccepted: nAccepted === 0 ? null : nCorrectAccepted / nAccepted,
    nFalsePositive,
    falsePositiveRateAmongAccepted: nAccepted === 0 ? null : nFalsePositive / nAccepted,
  };
}

/**
 * Select τ from fit rows only — never call with eval rows.
 * Returns null when no τ meets the precision floor (FP-costly: do not ship a weak gate).
 */
function selectThresholdFromFit(fitCurve: readonly Row[]): Effect.Effect<{
  readonly threshold: number | null;
  readonly rule: string;
  readonly fitRow: Row | null;
  readonly status: "selected" | "no_eligible_tau";
}> {
  return Effect.sync(() => {
    const eligible = fitCurve.filter(
      (r) =>
        r.nAccepted >= 1 &&
        r.accuracyAmongAccepted != null &&
        r.accuracyAmongAccepted >= MIN_PRECISION
    );
    if (eligible.length === 0) {
      return {
        threshold: null,
        rule: `no τ on fit set met precision≥${MIN_PRECISION}; selected=null (do not ship a low-precision fallback)`,
        fitRow: null,
        status: "no_eligible_tau" as const,
      };
    }
    const chosen = [...eligible].sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return b.threshold - a.threshold; // tie → stricter
    })[0]!;
    return {
      threshold: chosen.threshold,
      rule: `maximize coverage among τ with precision≥${MIN_PRECISION}; ties→higher τ`,
      fitRow: chosen,
      status: "selected" as const,
    };
  });
}

function loadScored(path: string): ScoredHeldOutCase[] {
  if (!existsSync(path)) {
    throw new Error(`missing ${path} — run overnight-fast-decision-calib.mts --phase dump first`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ScoredHeldOutCase[];
}

const harveyAll = applyCalib(loadScored(`${OUT_DIR}/harvey-raw-scored.json`));
const harveyRouting = harveyAll.filter((s) => s.useSiteId === USE_SITE);
const harveyFpCostly = harveyAll.filter((s) => FP_COSTLY_SITES.has(s.useSiteId));
const v03 = applyCalib(loadScored(`${OUT_DIR}/v03-raw-scored.json`));

if (harveyRouting.length === 0) {
  throw new Error("no Harvey routing cases after filter — cannot fit routing threshold");
}

const fitCurveRouting = THRESHOLD_GRID.map((τ) => metricsAt(harveyRouting, τ));
const selection = Effect.runSync(selectThresholdFromFit(fitCurveRouting));

const fitCurveFpPooled = THRESHOLD_GRID.map((τ) => metricsAt(harveyFpCostly, τ));
const selectionFpPooled = Effect.runSync(selectThresholdFromFit(fitCurveFpPooled));

// Eval on v0.3 ONLY after τ decision from Harvey
const evalCurve = THRESHOLD_GRID.map((τ) => metricsAt(v03, τ));
const evalAtBuiltin = metricsAt(v03, BUILTIN_THRESHOLD);
const evalAtSelected = selection.threshold != null ? metricsAt(v03, selection.threshold) : null;
const evalAtFpPooled =
  selectionFpPooled.threshold != null ? metricsAt(v03, selectionFpPooled.threshold) : null;

const readout = {
  generatedAt: new Date().toISOString(),
  useSiteId: USE_SITE,
  costlyErrorDirection: "false_positive",
  frozenCalibration: FROZEN,
  integrity: {
    temperatureFit: "Harvey v0.2 only (prior freeze); not re-tuned here",
    thresholdFitPrimary: "Harvey routing cases only; v0.3 never entered τ selection",
    selectionRuleLockedBeforeEval: selection.rule,
    minPrecisionTarget: MIN_PRECISION,
    builtinThresholdNotFitOnV03: BUILTIN_THRESHOLD,
  },
  fitPrimary: {
    suite: "v0.2-harvey",
    subset: "search_provider_tool_routing",
    n: harveyRouting.length,
    curve: fitCurveRouting,
    selected: selection,
    caseConfidences: harveyRouting.map((s) => ({
      caseId: s.caseId,
      topConfidence: s.topConfidence,
      correct: s.correct,
      top: s.topCandidateId,
      gt: s.groundTruthCandidateId,
    })),
  },
  fitSecondaryFpPooledProbe: {
    note: "Secondary only — pools FP-costly use sites. Not the routing-primary decision. Do not cite as routing held-out τ without a routing-sized fit set.",
    suite: "v0.2-harvey",
    subset: "fp_costly_use_sites",
    n: harveyFpCostly.length,
    curve: fitCurveFpPooled,
    selected: selectionFpPooled,
  },
  eval: {
    suite: "v0.3-routing-fresh",
    n: v03.length,
    atBuiltinThreshold075: evalAtBuiltin,
    atPrimarySelected: evalAtSelected,
    atSecondaryFpPooledSelected: evalAtFpPooled,
    curve: evalCurve,
  },
  reading: {
    usefulFastPath:
      "High accuracyAmongAccepted with material coverage (e.g. ≥~0.3–0.4) is a real win; high accuracy at ~5% coverage is usually not worth the complexity.",
    noteAccuracyUnchangedByTemperature:
      "Temperature does not change argmax; threshold gates which fraction of those argmax decisions fire the fast path.",
    primaryOutcome:
      selection.status === "no_eligible_tau"
        ? `Harvey routing n=${harveyRouting.length} cannot support precision≥${MIN_PRECISION} at any τ after T=3 — no new routing threshold shipped; operational reference remains builtin ${BUILTIN_THRESHOLD}.`
        : `Harvey routing selected τ=${selection.threshold}.`,
  },
};

writeFileSync(`${OUT_DIR}/routing-threshold-readout.json`, `${JSON.stringify(readout, null, 2)}\n`);
writeFileSync(
  "/opt/cursor/artifacts/fast-decision-routing-threshold-readout.json",
  `${JSON.stringify(readout, null, 2)}\n`
);

console.log(JSON.stringify(readout, null, 2));
console.error(
  `primary status=${selection.status} τ=${selection.threshold} | ` +
    `harveyRouting n=${harveyRouting.length} | ` +
    `v0.3 @builtin0.75 coverage=${evalAtBuiltin.coverage.toFixed(3)} ` +
    `accAmong=${evalAtBuiltin.accuracyAmongAccepted} ` +
    `(nAccepted=${evalAtBuiltin.nAccepted}/${evalAtBuiltin.n}) | ` +
    `secondaryFpPooled τ=${selectionFpPooled.threshold}`
);
