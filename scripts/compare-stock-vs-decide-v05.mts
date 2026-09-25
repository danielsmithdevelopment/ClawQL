#!/usr/bin/env npx tsx
/**
 * Stock GLiNER 2.5 vs GLiNER2.5-Decide — locked-τ score-once on frozen v0.5.
 *
 * Does NOT refit (T,τ). Locked knobs only:
 *   stock  — T=4,  τ=0.70  (FIT_TAU_FREEZE_v0.1 / live path)
 *   Decide — T=0.75, τ=0.80 (DECIDE_V05_FIT_TAU_LOCK; fit-only after freeze)
 *
 * Arms:
 *   1. stock forced EM
 *   2. Decide forced EM
 *   3. stock locked reject
 *   4. Decide locked reject
 *
 * Ship rule (predeclared): swap live to Decide only if arm 4 has nErrorsFired=0
 * under frontier-adjudicated GT.
 *
 * Phases:
 *   score  — live sidecar; dump raw scores for fit + eval (v0.5)
 *   report — offline; combine dumps + locked knobs (+ optional frontier labels)
 *
 * Usage:
 *   CLAWQL_FAST_DECISION_GLINER_URL=http://127.0.0.1:18081 \
 *     npx tsx scripts/compare-stock-vs-decide-v05.mts score \
 *       --model-tag stock --out /tmp/stock-scores.json
 *
 *   npx tsx scripts/compare-stock-vs-decide-v05.mts report \
 *     --stock /tmp/stock-scores.json --decide /tmp/decide-scores.json \
 *     [--labels path/to/frontier-labels.json] \
 *     --out /tmp/stock-vs-decide-v05-report.json
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
  applyCalibrationToScores,
  applyAdjudicationLabels,
  loadLiveAdjudicationLabelsFromJsonFile,
  candidatesEquivalent,
  type ScoredHeldOutCase,
  type FastDecisionScore,
  type CalibrationTransform,
  type CalibrationMode,
} from "../packages/clawql-core/src/classifier/index.ts";
import { loadHeldOutSuite } from "../packages/clawql-core/src/classifier/held-out/run-held-out.ts";

const FIT_PATH =
  "packages/clawql-core/src/classifier/held-out/fixtures/fast-decision-fit-routing-v0.1.json";
const EVAL_SUITE = "v0.5-routing-fresh";
const STOCK_T = 4;
const STOCK_TAU = 0.7;
const STOCK_MODE: CalibrationMode = "temperature_softmax";
const DECIDE_T = 0.75;
const DECIDE_TAU = 0.8;
const DECIDE_MODE: CalibrationMode = "temperature_softmax";

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
  evalSuite: string;
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
      correct: Boolean(
        top && candidatesEquivalent(top.candidateId, s.groundTruthCandidateId)
      ),
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
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += binomialPmf(i, n, p);
  }
  return Math.min(1, Math.max(0, sum));
}

function binomialPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  let logC = 0;
  for (let i = 1; i <= k; i++) logC += Math.log(n - k + i) - Math.log(i);
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function metricsAt(scored: readonly ScoredHeldOutCase[], threshold: number | null) {
  const n = scored.length;
  const accepted =
    threshold == null
      ? [...scored]
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

function rematchGroundTruth(
  scored: readonly ScoredHeldOutCase[],
  gtByCaseId: ReadonlyMap<string, string>
): ScoredHeldOutCase[] {
  return scored.map((s) => {
    const gt = gtByCaseId.get(s.caseId);
    if (!gt) return s;
    return {
      ...s,
      groundTruthCandidateId: gt,
      // top-* still raw; correct recomputed after calib (twin-aware)
      correct: Boolean(s.topCandidateId && candidatesEquivalent(s.topCandidateId, gt)),
    };
  });
}

async function loadGtMap(labelsPath: string | undefined): Promise<{
  gtByCaseId: Map<string, string> | null;
  labelsPath: string | null;
  labelCount: number;
}> {
  if (!labelsPath) {
    return { gtByCaseId: null, labelsPath: null, labelCount: 0 };
  }
  const labels = await Effect.runPromise(loadLiveAdjudicationLabelsFromJsonFile(labelsPath));
  const gtByCaseId = new Map<string, string>();
  for (const l of labels) {
    gtByCaseId.set(l.caseId, l.groundTruthCandidateId);
  }
  return { gtByCaseId, labelsPath, labelCount: labels.length };
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

async function phaseScore(): Promise<void> {
  const outPath = argValue("--out");
  const modelTag = argValue("--model-tag") ?? "model";
  const labelsPath = argValue("--labels");
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
  console.error(
    `scoring fit+eval modelTag=${modelTag} modelId=${modelId} eval=${EVAL_SUITE}` +
      (labelsPath ? ` labels=${labelsPath}` : " (provisional GT)")
  );
  const fit = await scoreSuite(FIT_PATH, "search_provider_tool_routing", undefined);
  console.error(`fit n=${fit.scored.length} backend=${fit.backend}`);
  const ev = await scoreSuite(EVAL_SUITE, "search_provider_tool_routing", labelsPath);
  console.error(`eval n=${ev.scored.length} backend=${ev.backend}`);
  const dump: ScoreDump = {
    modelTag,
    modelId,
    backend: ev.backend,
    scoredAt: new Date().toISOString(),
    evalSuite: EVAL_SUITE,
    fit: compact(fit.scored),
    eval: compact(ev.scored),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(dump, null, 2) + "\n");
  console.error(`wrote ${outPath}`);
}

async function phaseReport(): Promise<void> {
  const stockPath = argValue("--stock");
  const decidePath = argValue("--decide");
  const labelsPath = argValue("--labels");
  const outPath = argValue("--out") ?? "/opt/cursor/artifacts/stock-vs-decide/v05-report.json";
  if (!stockPath || !decidePath) {
    console.error("report phase requires --stock <dump.json> --decide <dump.json>");
    process.exit(2);
  }
  const stock = JSON.parse(readFileSync(stockPath, "utf8")) as ScoreDump;
  const decide = JSON.parse(readFileSync(decidePath, "utf8")) as ScoreDump;
  const { gtByCaseId, labelCount } = await loadGtMap(labelsPath);

  let stockEval = toScored(stock.eval);
  let decideEval = toScored(decide.eval);
  if (gtByCaseId) {
    stockEval = rematchGroundTruth(stockEval, gtByCaseId);
    decideEval = rematchGroundTruth(decideEval, gtByCaseId);
  }

  const stockLocked: CalibrationTransform = {
    mode: STOCK_MODE,
    temperature: STOCK_T,
  };
  const decideLocked: CalibrationTransform = {
    mode: DECIDE_MODE,
    temperature: DECIDE_T,
  };

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
  const arm3 = armReport(
    "stock_locked_T_tau",
    stock.modelId,
    applyCalib(stockEval, stockLocked),
    STOCK_TAU,
    stockLocked,
    "locked from FIT_TAU_FREEZE_v0.1 (T=4, τ=0.70); not refit on v0.5"
  );
  const arm4 = armReport(
    "decide_locked_T_tau",
    decide.modelId,
    applyCalib(decideEval, decideLocked),
    DECIDE_TAU,
    decideLocked,
    "locked from DECIDE_V05_FIT_TAU_LOCK (T=0.75, τ=0.80); not refit on v0.5"
  );

  const decideReject = arm4;
  const stockReject = arm3;
  const equalErrors = decideReject.nErrorsFired === stockReject.nErrorsFired;
  const decideHigherCoverage = decideReject.fireRate > stockReject.fireRate;
  const decideFewerErrors = decideReject.nErrorsFired < stockReject.nErrorsFired;
  // V06 spend rule: fewer fire errors wins; equal errors → prefer higher coverage.
  const shipEligible =
    Boolean(gtByCaseId) &&
    labelCount === decideReject.n &&
    decideReject.nFired > 0 &&
    (decideFewerErrors || (equalErrors && decideHigherCoverage));

  const report = {
    protocol:
      "stock vs Decide locked-τ on frozen v0.5; twin-aware correctness; V06 spend ship rule",
    evalSuite: EVAL_SUITE,
    fitPath: FIT_PATH,
    labelsPath: labelsPath ?? null,
    labelCount,
    groundTruthSource: gtByCaseId ? "frontier_labels" : "provisional_suite_gt",
    lockedKnobs: {
      stock: { mode: STOCK_MODE, temperature: STOCK_T, tau: STOCK_TAU },
      decide: { mode: DECIDE_MODE, temperature: DECIDE_T, tau: DECIDE_TAU },
    },
    stockDump: { path: stockPath, modelId: stock.modelId, backend: stock.backend },
    decideDump: { path: decidePath, modelId: decide.modelId, backend: decide.backend },
    arms: [arm1, arm2, arm3, arm4],
    shipRule: {
      rule: "V06 spend: fewer fire errors wins; equal errors → prefer higher coverage (twins count as correct)",
      decideNFired: decideReject.nFired,
      decideNErrorsFired: decideReject.nErrorsFired,
      stockNFired: stockReject.nFired,
      stockNErrorsFired: stockReject.nErrorsFired,
      frontierLabelsPresent: Boolean(gtByCaseId),
      labelCountMatchesEval: gtByCaseId ? labelCount === decideReject.n : false,
      shipEligible,
    },
    honesty: [
      "v0.5 scored once with knobs locked before any v0.5 scores existed",
      "Decide T/τ from fit-only lock (DECIDE_V05_FIT_TAU_LOCK); no refit on eval",
      "After V06 cutover live path is Decide T=0.75/τ=0.80 (see DECIDE_V06_CUTOVER.md)",
      "Closeout citation requires frontier_labels groundTruthSource",
      "quote nFired and CP lower bound whenever citing precision among fired",
    ],
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.error(`wrote ${outPath}`);
  console.error(
    `shipEligible=${shipEligible} decideFired=${decideReject.nFired} decideErrors=${decideReject.nErrorsFired} gt=${report.groundTruthSource}`
  );
}

const phase = process.argv[2];
if (phase === "score") {
  await phaseScore();
} else if (phase === "report") {
  await phaseReport();
} else {
  console.error("usage: compare-stock-vs-decide-v05.mts <score|report> …");
  process.exit(2);
}
