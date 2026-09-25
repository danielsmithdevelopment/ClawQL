#!/usr/bin/env npx tsx
/**
 * Stock GLiNER 2.5 vs GLiNER2.5-Decide — four-arm score-once on frozen v0.4.
 *
 * Arms (v0.5-compatible; does NOT rewrite the v0.4 closeout):
 *   1. stock forced exact-match (no reject)
 *   2. Decide forced exact-match (no reject)
 *   3. stock with locked (T=4, τ=0.70) from FIT_TAU_FREEZE
 *   4. Decide with (T,τ) refit on the *same* fit set, then applied once to v0.4
 *
 * Phases:
 *   score  — live sidecar; dump raw scores for fit + eval
 *   report — offline; combine stock+Decide score dumps into the four-arm table
 *
 * Usage:
 *   CLAWQL_FAST_DECISION_GLINER_URL=http://127.0.0.1:18081 \
 *     npx tsx scripts/compare-stock-vs-decide-v04.mts score \
 *       --model-tag stock --out /tmp/stock-scores.json
 *
 *   npx tsx scripts/compare-stock-vs-decide-v04.mts report \
 *     --stock /tmp/stock-scores.json --decide /tmp/decide-scores.json \
 *     --out /tmp/stock-vs-decide-report.json
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
  applyAdjudicationLabels,
  loadLiveAdjudicationLabelsFromJsonFile,
  type ScoredHeldOutCase,
  type FastDecisionScore,
  type CalibrationTransform,
  type CalibrationMode,
} from "../packages/clawql-core/src/classifier/index.ts";
import { loadHeldOutSuite } from "../packages/clawql-core/src/classifier/held-out/run-held-out.ts";

const FIT_PATH =
  "packages/clawql-core/src/classifier/held-out/fixtures/fast-decision-fit-routing-v0.1.json";
const EVAL_SUITE = "v0.4-routing-fresh";
const LABELS_PATH =
  "packages/clawql-core/src/classifier/held-out/fixtures/frontier-runs/v0.4-routing-fresh-gha-36144911649-labels.json";
const STOCK_T = 4;
const STOCK_TAU = 0.7;
const STOCK_MODE: CalibrationMode = "temperature_softmax";
const MIN_PRECISION = 0.9;
const THRESHOLD_GRID = [
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.92, 0.95, 0.97, 0.99,
];
const TEMP_GRID = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

type CompactScored = {
  caseId: string;
  useSiteId: string;
  groundTruthCandidateId: string;
  scores: Array<{ candidateId: string; confidence: number }>;
  topCandidateId?: string;
  topConfidence?: number;
  correct: boolean;
};

type ScoreDump = {
  modelTag: string;
  modelId: string;
  backend: string;
  scoredAt: string;
  fit: CompactScored[];
  eval: CompactScored[];
};

function compact(scored: readonly ScoredHeldOutCase[]): CompactScored[] {
  return scored.map((s) => ({
    caseId: s.caseId,
    useSiteId: s.useSiteId,
    groundTruthCandidateId: s.groundTruthCandidateId,
    scores: s.scores.map((x) => ({
      candidateId: x.candidateId,
      confidence: x.confidence,
    })),
    topCandidateId: s.topCandidateId,
    topConfidence: s.topConfidence,
    correct: s.correct,
  }));
}

function toScored(rows: CompactScored[]): ScoredHeldOutCase[] {
  return rows.map((r) => ({
    caseId: r.caseId,
    useSiteId: r.useSiteId,
    groundTruthCandidateId: r.groundTruthCandidateId,
    adjudicated: true,
    adjudicationKind: "live" as const,
    scores: r.scores as FastDecisionScore[],
    topCandidateId: r.topCandidateId,
    topConfidence: r.topConfidence,
    correct: r.correct,
  }));
}

async function scoreSuite(
  suiteNameOrPath: string,
  useSiteFilter: string | undefined,
  labelsPath: string | undefined
): Promise<{ backend: string; scored: ScoredHeldOutCase[] }> {
  delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  process.env.CLAWQL_FAST_DECISION_CALIBRATION = "0";
  let suite =
    suiteNameOrPath.endsWith(".json") || suiteNameOrPath.includes("/")
      ? loadHeldOutSuite(suiteNameOrPath)
      : resolveHeldOutSuite(suiteNameOrPath);
  if (labelsPath) {
    const labels = await Effect.runPromise(loadLiveAdjudicationLabelsFromJsonFile(labelsPath));
    suite = applyAdjudicationLabels(suite, labels);
  }
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

/** Clopper–Pearson 95% lower bound (central interval; matches FIT_TAU ≈82% at 18/18). */
function clopperPearsonLower95(successes: number, n: number): number | null {
  if (n <= 0) return null;
  if (successes <= 0) return 0;
  if (successes >= n) {
    return Math.pow(0.025, 1 / n);
  }
  // Lower bound of central 95% CI: solve F_{Beta(k, n-k+1)}(p) = 0.025
  // via P(X >= k | n, p) = 0.025  ⟺  F(k-1; n, p) = 0.975
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const cdf = binomialCdf(successes - 1, n, mid);
    if (cdf > 0.975) lo = mid;
    else hi = mid;
  }
  return lo;
}

function binomialCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  // Sum binom pmf 0..k in log space
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += binomialPmf(i, n, p);
  }
  return Math.min(1, Math.max(0, sum));
}

function binomialPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  // log C(n,k) + k log p + (n-k) log(1-p)
  let logC = 0;
  for (let i = 1; i <= k; i++) logC += Math.log(n - k + i) - Math.log(i);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function metricsAt(scored: readonly ScoredHeldOutCase[], threshold: number | null) {
  const n = scored.length;
  const accepted =
    threshold == null
      ? [...scored] // forced: every case fires (top-1 always)
      : scored.filter((s) => (s.topConfidence ?? 0) >= threshold);
  const nFired = accepted.length;
  const nCorrectFired = accepted.filter((s) => s.correct).length;
  const nErrorsFired = nFired - nCorrectFired;
  const precision = nFired === 0 ? null : nCorrectFired / nFired;
  return {
    n,
    nFired,
    fireRate: n === 0 ? 0 : nFired / n,
    nCorrectFired,
    nErrorsFired,
    precisionAmongFired: precision,
    cpLower95: precision == null ? null : clopperPearsonLower95(nCorrectFired, nFired),
    forcedExactMatchAcc: n === 0 ? null : scored.filter((s) => s.correct).length / n,
  };
}

function selectTau(fitCalibrated: readonly ScoredHeldOutCase[]): {
  threshold: number | null;
  status: string;
  fitRow: ReturnType<typeof metricsAt> | null;
} {
  const curve = THRESHOLD_GRID.map((τ) => ({ τ, ...metricsAt(fitCalibrated, τ) }));
  const eligible = curve.filter(
    (r) =>
      r.nFired >= 1 &&
      r.precisionAmongFired != null &&
      r.precisionAmongFired >= MIN_PRECISION
  );
  if (eligible.length === 0) {
    return { threshold: null, status: "no_eligible_tau", fitRow: null };
  }
  const chosen = [...eligible].sort((a, b) => {
    if (b.fireRate !== a.fireRate) return b.fireRate - a.fireRate;
    return b.τ - a.τ;
  })[0]!;
  return {
    threshold: chosen.τ,
    status: "selected",
    fitRow: metricsAt(fitCalibrated, chosen.τ),
  };
}

function fitBestTransform(fitRaw: readonly ScoredHeldOutCase[]): CalibrationTransform {
  const modes: CalibrationMode[] = ["temperature_softmax", "temperature_sigmoid"];
  const results: {
    mode: CalibrationMode;
    temperature: number;
    fitMce: number;
    fitPassed: boolean;
  }[] = [];
  for (const mode of modes) {
    const fit = Effect.runSync(
      fitTemperatureByGrid({
        cases: fitRaw.map((s) => ({
          groundTruthCandidateId: s.groundTruthCandidateId,
          scores: s.scores,
        })),
        mode,
        temperatures: TEMP_GRID,
        criteria: DEFAULT_VALIDATION_CRITERIA,
      })
    );
    const transform: CalibrationTransform = { mode, temperature: fit.temperature };
    const cal = evaluateCorrectnessAndCalibration(
      "fit_routing",
      applyCalib(fitRaw, transform).map((s) => ({
        caseId: s.caseId,
        groundTruthCandidateId: s.groundTruthCandidateId,
        scores: s.scores,
      })),
      DEFAULT_VALIDATION_CRITERIA
    );
    results.push({
      mode,
      temperature: fit.temperature,
      fitMce: cal.meanCalibrationError,
      fitPassed: cal.passed,
    });
  }
  const ranked = [...results].sort((a, b) => {
    const ap = a.fitPassed ? 0 : 1;
    const bp = b.fitPassed ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (Math.abs(a.fitMce - b.fitMce) > 1e-12) return a.fitMce - b.fitMce;
    if (a.mode === "temperature_softmax" && b.mode !== "temperature_softmax") return -1;
    if (b.mode === "temperature_softmax" && a.mode !== "temperature_softmax") return 1;
    return 0;
  });
  const best = ranked[0]!;
  return { mode: best.mode, temperature: best.temperature };
}

async function phaseScore(): Promise<void> {
  const outPath = argValue("--out");
  const modelTag = argValue("--model-tag") ?? "model";
  if (!outPath) {
    console.error("score phase requires --out <path>");
    process.exit(2);
  }
  if (!process.env.CLAWQL_FAST_DECISION_GLINER_URL?.trim()) {
    console.error("CLAWQL_FAST_DECISION_GLINER_URL required for score phase");
    process.exit(2);
  }
  const modelId =
    process.env.CLAWQL_FAST_DECISION_GLINER_MODEL?.trim() || "fastino/gliner2.5-base-v1";
  console.error(`scoring fit+eval modelTag=${modelTag} modelId=${modelId}`);
  const fit = await scoreSuite(FIT_PATH, "search_provider_tool_routing", undefined);
  console.error(`fit n=${fit.scored.length} backend=${fit.backend}`);
  const ev = await scoreSuite(EVAL_SUITE, "search_provider_tool_routing", LABELS_PATH);
  console.error(`eval n=${ev.scored.length} backend=${ev.backend}`);
  const dump: ScoreDump = {
    modelTag,
    modelId,
    backend: ev.backend,
    scoredAt: new Date().toISOString(),
    fit: compact(fit.scored),
    eval: compact(ev.scored),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(dump, null, 2) + "\n");
  console.error(`wrote ${outPath}`);
}

function armReport(
  name: string,
  model: string,
  evalScored: readonly ScoredHeldOutCase[],
  threshold: number | null,
  calib: CalibrationTransform | null,
  notes: string
) {
  const m = metricsAt(evalScored, threshold);
  return {
    arm: name,
    model,
    calibration: calib,
    threshold: threshold,
    rejectRule: threshold != null,
    notes,
    ...m,
  };
}

async function phaseReport(): Promise<void> {
  const stockPath = argValue("--stock");
  const decidePath = argValue("--decide");
  const outPath = argValue("--out") ?? "/opt/cursor/artifacts/stock-vs-decide/report.json";
  if (!stockPath || !decidePath) {
    console.error("report phase requires --stock <dump.json> --decide <dump.json>");
    process.exit(2);
  }
  const stock = JSON.parse(readFileSync(stockPath, "utf8")) as ScoreDump;
  const decide = JSON.parse(readFileSync(decidePath, "utf8")) as ScoreDump;

  const stockFit = toScored(stock.fit);
  const stockEval = toScored(stock.eval);
  const decideFit = toScored(decide.fit);
  const decideEval = toScored(decide.eval);

  // Arm 1+2: forced (no reject) — raw top-1
  const arm1 = armReport(
    "stock_forced",
    stock.modelId,
    stockEval,
    null,
    null,
    "forced exact-match; no reject rule"
  );
  const arm2 = armReport(
    "decide_forced",
    decide.modelId,
    decideEval,
    null,
    null,
    "forced exact-match; no reject rule"
  );

  // Arm 3: stock locked (T=4, τ=0.70) — do not refit
  const stockLocked: CalibrationTransform = {
    mode: STOCK_MODE,
    temperature: STOCK_T,
  };
  const stockCalEval = applyCalib(stockEval, stockLocked);
  const arm3 = armReport(
    "stock_locked_T_tau",
    stock.modelId,
    stockCalEval,
    STOCK_TAU,
    stockLocked,
    "locked from FIT_TAU_FREEZE_v0.1 (T=4, τ=0.70); not refit on v0.4"
  );

  // Arm 4: Decide (T,τ) refit on same fit set, then one pass on v0.4
  const decideTransform = fitBestTransform(decideFit);
  const decideFitCal = applyCalib(decideFit, decideTransform);
  const decideTau = selectTau(decideFitCal);
  const decideCalEval = applyCalib(decideEval, decideTransform);
  const arm4 = armReport(
    "decide_refit_T_tau",
    decide.modelId,
    decideCalEval,
    decideTau.threshold,
    decideTransform,
    `refit on same fit set (spent v0.3+Harvey routing); τ status=${decideTau.status}`
  );

  const report = {
    protocol:
      "stock vs Decide four-arm score-once on frozen v0.4; does not rewrite productionTrusted closeout",
    labelsPath: LABELS_PATH,
    fitPath: FIT_PATH,
    evalSuite: EVAL_SUITE,
    stockDump: { path: stockPath, modelId: stock.modelId, backend: stock.backend },
    decideDump: { path: decidePath, modelId: decide.modelId, backend: decide.backend },
    decideFit: {
      transform: decideTransform,
      tau: decideTau.threshold,
      tauStatus: decideTau.status,
      fitAtTau: decideTau.fitRow,
    },
    arms: [arm1, arm2, arm3, arm4],
    honesty: [
      "v0.4 remains spent for stock T/τ selection",
      "Decide (T,τ) fit only on the shared off-set; applied once to frozen v0.4",
      "forced arms report exact-match accuracy (fireRate=1); reject arms report fire rate + CP LB on nFired",
      "quote nFired and CP lower bound whenever citing precision among fired",
    ],
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.error(`wrote ${outPath}`);
}

const phase = process.argv[2];
if (phase === "score") {
  await phaseScore();
} else if (phase === "report") {
  await phaseReport();
} else {
  console.error("usage: compare-stock-vs-decide-v04.mts <score|report> …");
  process.exit(2);
}
