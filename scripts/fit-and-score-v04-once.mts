#!/usr/bin/env npx tsx
/**
 * Three-set fit → freeze (T, τ) → score v0.4 once.
 *
 * Fit set: spent v0.3 routing + Harvey routing (fast-decision-fit-routing-v0.1).
 * Eval: frozen v0.4 (scored once; not used for selection).
 *
 * Usage:
 *   npx tsx scripts/fit-and-score-v04-once.mts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { Effect } from "effect";
import {
  createGlinerFastDecisionScorerLayer,
  FastDecisionScorer,
  resolveHeldOutSuite,
  scoreHeldOutCases,
  casesForUseSite,
  evaluateCorrectnessAndCalibration,
  DEFAULT_VALIDATION_CRITERIA,
  applyCalibrationToScores,
  fitTemperatureByGrid,
  type ScoredHeldOutCase,
  type FastDecisionScore,
  type CalibrationTransform,
  type CalibrationMode,
} from "../packages/clawql-core/src/classifier/index.ts";
import { loadHeldOutSuite } from "../packages/clawql-core/src/classifier/held-out/run-held-out.ts";

const OUT = process.env.OVERNIGHT_CALIB_OUT ?? "/opt/cursor/artifacts/overnight-calib";
mkdirSync(OUT, { recursive: true });

const MIN_PRECISION = 0.9;
const THRESHOLD_GRID = [
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.99,
];
const TEMP_GRID = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

type Row = {
  threshold: number;
  n: number;
  nAccepted: number;
  coverage: number;
  nCorrectAccepted: number;
  accuracyAmongAccepted: number | null;
  nFalsePositive: number;
};

async function scoreRaw(suiteNameOrPath: string, useSiteFilter?: string): Promise<{
  backend: string;
  scored: ScoredHeldOutCase[];
}> {
  delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  process.env.CLAWQL_FAST_DECISION_CALIBRATION = "0";
  const suite =
    suiteNameOrPath.endsWith(".json") || suiteNameOrPath.includes("/")
      ? loadHeldOutSuite(suiteNameOrPath)
      : resolveHeldOutSuite(suiteNameOrPath);
  const cases = useSiteFilter ? casesForUseSite(suite, useSiteFilter) : [...suite.cases];
  const layer = createGlinerFastDecisionScorerLayer({
    calibration: { enabled: false, mode: "none", temperature: 1 },
  });
  return Effect.runPromise(
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const scored = yield* scoreHeldOutCases(cases);
      return { backend: scorer.backendId(), scored: [...scored] };
    }).pipe(Effect.provide(layer))
  );
}

function applyCalib(
  scored: readonly ScoredHeldOutCase[],
  transform: CalibrationTransform
): ScoredHeldOutCase[] {
  return scored.map((s) => {
    const scores = applyCalibrationToScores(s.scores as readonly FastDecisionScore[], transform);
    const zero = scores.length > 0 && scores.every((x) => x.confidence <= 0);
    const top = zero
      ? undefined
      : [...scores].sort((a, b) => b.confidence - a.confidence)[0];
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
  const nFalsePositive = nAccepted - nCorrectAccepted;
  return {
    threshold,
    n,
    nAccepted,
    coverage: n === 0 ? 0 : nAccepted / n,
    nCorrectAccepted,
    accuracyAmongAccepted: nAccepted === 0 ? null : nCorrectAccepted / nAccepted,
    nFalsePositive,
  };
}

function selectTau(fitCurve: readonly Row[]): {
  threshold: number | null;
  status: "selected" | "no_eligible_tau";
  rule: string;
  fitRow: Row | null;
} {
  const eligible = fitCurve.filter(
    (r) =>
      r.nAccepted >= 1 &&
      r.accuracyAmongAccepted != null &&
      r.accuracyAmongAccepted >= MIN_PRECISION
  );
  if (eligible.length === 0) {
    return {
      threshold: null,
      status: "no_eligible_tau",
      rule: `no τ met precision≥${MIN_PRECISION} on fit; selected=null`,
      fitRow: null,
    };
  }
  const chosen = [...eligible].sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return b.threshold - a.threshold;
  })[0]!;
  return {
    threshold: chosen.threshold,
    status: "selected",
    rule: `maximize coverage among τ with precision≥${MIN_PRECISION}; ties→higher τ`,
    fitRow: chosen,
  };
}

function report(
  useSiteId: string,
  scored: readonly ScoredHeldOutCase[]
): ReturnType<typeof evaluateCorrectnessAndCalibration> {
  return evaluateCorrectnessAndCalibration(
    useSiteId,
    scored.map((s) => ({
      caseId: s.caseId,
      groundTruthCandidateId: s.groundTruthCandidateId,
      scores: s.scores,
    })),
    DEFAULT_VALIDATION_CRITERIA
  );
}

console.error("scoring fit set (raw, calib off)…");
const fitPath =
  "packages/clawql-core/src/classifier/held-out/fixtures/fast-decision-fit-routing-v0.1.json";
const fitRaw = await scoreRaw(fitPath);
console.error(`fit backend=${fitRaw.backend} n=${fitRaw.scored.length}`);

const modes: CalibrationMode[] = ["temperature_softmax", "temperature_sigmoid"];
const fitResults: {
  mode: CalibrationMode;
  temperature: number;
  fitAcc: number;
  fitMce: number;
  fitPassed: boolean;
  buckets: ReturnType<typeof evaluateCorrectnessAndCalibration>["buckets"];
}[] = [];

for (const mode of modes) {
  const fit = Effect.runSync(
    fitTemperatureByGrid({
      cases: fitRaw.scored.map((s) => ({
        groundTruthCandidateId: s.groundTruthCandidateId,
        scores: s.scores,
      })),
      mode,
      temperatures: TEMP_GRID,
      criteria: DEFAULT_VALIDATION_CRITERIA,
    })
  );
  const transform: CalibrationTransform = { mode, temperature: fit.temperature };
  const cal = report("fit_routing", applyCalib(fitRaw.scored, transform));
  fitResults.push({
    mode,
    temperature: fit.temperature,
    fitAcc: cal.rawAccuracy,
    fitMce: cal.meanCalibrationError,
    fitPassed: cal.passed,
    buckets: cal.buckets,
  });
  console.error(
    `fit mode=${mode} T=${fit.temperature} acc=${cal.rawAccuracy.toFixed(3)} mce=${cal.meanCalibrationError.toFixed(3)} passed=${cal.passed}`
  );
}

// Lock T: among passing modes prefer lowest MCE; ties → temperature_softmax.
// If none pass, lowest MCE overall; ties → temperature_softmax.
const ranked = [...fitResults].sort((a, b) => {
  const ap = a.fitPassed ? 0 : 1;
  const bp = b.fitPassed ? 0 : 1;
  if (ap !== bp) return ap - bp;
  if (Math.abs(a.fitMce - b.fitMce) > 1e-12) return a.fitMce - b.fitMce;
  if (a.mode === "temperature_softmax" && b.mode !== "temperature_softmax") return -1;
  if (b.mode === "temperature_softmax" && a.mode !== "temperature_softmax") return 1;
  return 0;
});
const best = ranked[0]!;
const bestTransform: CalibrationTransform = {
  mode: best.mode,
  temperature: best.temperature,
};

const fitCalibrated = applyCalib(fitRaw.scored, bestTransform);
const fitCalReport = report("fit_routing", fitCalibrated);
const fitCurve = THRESHOLD_GRID.map((τ) => metricsAt(fitCalibrated, τ));
const tauSel = selectTau(fitCurve);

console.error(
  `locked T: mode=${bestTransform.mode} T=${bestTransform.temperature} | τ status=${tauSel.status} τ=${tauSel.threshold}`
);

console.error("scoring v0.4 once (locked T; enrichment off)…");
const v04Raw = await scoreRaw("v0.4-routing-fresh", "search_provider_tool_routing");
const v04Calibrated = applyCalib(v04Raw.scored, bestTransform);
const v04Cal = report("search_provider_tool_routing", v04Calibrated);
const v04AtTau =
  tauSel.threshold != null ? metricsAt(v04Calibrated, tauSel.threshold) : null;
const v04At075 = metricsAt(v04Calibrated, 0.75);
const v04Curve = THRESHOLD_GRID.map((τ) => metricsAt(v04Calibrated, τ));

const freeze = {
  generatedAt: new Date().toISOString(),
  protocol: "THREE_SET_PROTOCOL.md",
  fitSuiteId: "fast-decision-fit-routing-v0.1",
  fitN: fitRaw.scored.length,
  fitComposition: { v03Routing: 34, harveyRouting: 7 },
  evalSuiteId: "fast-decision-held-out-v0.4-routing-fresh",
  evalN: v04Raw.scored.length,
  scorerBackendFit: fitRaw.backend,
  scorerBackendEval: v04Raw.backend,
  enrichment: "off",
  lockedCalibration: bestTransform,
  fitCalibrationReport: {
    acc: fitCalReport.rawAccuracy,
    mce: fitCalReport.meanCalibrationError,
    passed: fitCalReport.passed,
    buckets: fitCalReport.buckets,
  },
  temperatureGridResults: fitResults,
  lockedThreshold: {
    ...tauSel,
    minPrecision: MIN_PRECISION,
    costlyErrorDirection: "false_positive",
  },
  fitThresholdCurve: fitCurve,
  evalOnce: {
    note: "Single score of frozen v0.4 after (T,τ) locked on fit set. Provisional GT (adjudicated=false).",
    calibration: {
      acc: v04Cal.rawAccuracy,
      mce: v04Cal.meanCalibrationError,
      passed: v04Cal.passed,
      buckets: v04Cal.buckets,
      failureReasons: v04Cal.failureReasons,
    },
    atLockedTau: v04AtTau,
    atBuiltin075: v04At075,
    thresholdCurve: v04Curve,
  },
  productionTrusted: false,
  productionTrustedBlockers: [
    "v0.4 cases adjudicated=false — need live frontier labels",
    tauSel.status === "no_eligible_tau"
      ? "no FP-costly τ met precision≥0.9 on fit set"
      : null,
  ].filter(Boolean),
};

writeFileSync(`${OUT}/fit-and-score-v04-once.json`, `${JSON.stringify(freeze, null, 2)}\n`);
writeFileSync(
  "/opt/cursor/artifacts/fast-decision-fit-and-score-v04-once.json",
  `${JSON.stringify(freeze, null, 2)}\n`
);
writeFileSync(`${OUT}/fit-raw-scored.json`, `${JSON.stringify(fitRaw.scored, null, 2)}\n`);
writeFileSync(`${OUT}/v04-raw-scored.json`, `${JSON.stringify(v04Raw.scored, null, 2)}\n`);

console.log(JSON.stringify(freeze, null, 2));
console.error(`wrote ${OUT}/fit-and-score-v04-once.json`);
