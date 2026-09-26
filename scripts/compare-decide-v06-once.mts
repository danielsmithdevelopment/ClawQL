#!/usr/bin/env npx tsx
/**
 * Decide live-path score-once on frozen v0.6 (confirmation suite).
 *
 * Locked knobs (already live): T=0.75, τ=0.80, model Decide.
 * Twin-aware correctness via candidatesEquivalent.
 *
 * Phases:
 *   score  — live sidecar; dump raw scores for v0.6 eval
 *   report — offline; apply locked calib + optional frontier labels
 *
 * Usage:
 *   CLAWQL_FAST_DECISION_GLINER_URL=http://127.0.0.1:18081 \
 *     npx tsx scripts/compare-decide-v06-once.mts score --out /tmp/decide-v06-scores.json
 *
 *   npx tsx scripts/compare-decide-v06-once.mts report \
 *     --scores /tmp/decide-v06-scores.json \
 *     [--labels path/to/frontier-labels.json] \
 *     --out /tmp/decide-v06-report.json
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
} from "../packages/clawql-core/src/classifier/index.ts";

const EVAL_SUITE = "v0.6-routing-fresh";
const DECIDE_T = 0.75;
const DECIDE_TAU = 0.8;

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
  suiteName: string,
  labelsPath: string | undefined
): Promise<{ backend: string; scored: ScoredHeldOutCase[] }> {
  delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  process.env.CLAWQL_FAST_DECISION_CALIBRATION = "0";
  let suite = resolveHeldOutSuite(suiteName);
  if (labelsPath) {
    const labels = await Effect.runPromise(loadLiveAdjudicationLabelsFromJsonFile(labelsPath));
    suite = applyAdjudicationLabels(suite, labels);
  }
  const cases = casesForUseSite(suite, "search_provider_tool_routing");
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

function clopperPearsonLower95(successes: number, n: number): number | null {
  if (n <= 0) return null;
  if (successes <= 0) return 0;
  if (successes >= n) return Math.pow(0.025, 1 / n);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    let cdf = 0;
    for (let k = 0; k <= successes - 1; k++) {
      let logC = 0;
      for (let j = 1; j <= k; j++) logC += Math.log(n - k + j) - Math.log(j);
      cdf += Math.exp(logC + k * Math.log(mid) + (n - k) * Math.log(1 - mid));
    }
    if (cdf > 0.975) lo = mid;
    else hi = mid;
  }
  return lo;
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
      correct: Boolean(s.topCandidateId && candidatesEquivalent(s.topCandidateId, gt)),
    };
  });
}

async function phaseScore(): Promise<void> {
  const outPath = argValue("--out");
  const labelsPath = argValue("--labels");
  if (!outPath) {
    console.error("score phase requires --out <path>");
    process.exit(2);
  }
  if (!process.env.CLAWQL_FAST_DECISION_GLINER_URL?.trim()) {
    console.error("CLAWQL_FAST_DECISION_GLINER_URL required");
    process.exit(2);
  }
  const modelId =
    process.env.CLAWQL_FAST_DECISION_GLINER_MODEL?.trim() || "fastino/GLiNER2.5-Decide";
  console.error(`scoring eval=${EVAL_SUITE} modelId=${modelId}`);
  const ev = await scoreSuite(EVAL_SUITE, labelsPath);
  console.error(`eval n=${ev.scored.length} backend=${ev.backend}`);
  const dump: ScoreDump = {
    modelTag: "decide",
    modelId,
    backend: ev.backend,
    scoredAt: new Date().toISOString(),
    evalSuite: EVAL_SUITE,
    eval: compact(ev.scored),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(dump, null, 2) + "\n");
  console.error(`wrote ${outPath}`);
}

async function phaseReport(): Promise<void> {
  const scoresPath = argValue("--scores");
  const labelsPath = argValue("--labels");
  const outPath = argValue("--out") ?? "/opt/cursor/artifacts/decide-v06/report.json";
  if (!scoresPath) {
    console.error("report phase requires --scores <dump.json>");
    process.exit(2);
  }
  const dump = JSON.parse(readFileSync(scoresPath, "utf8")) as ScoreDump;
  let evalRows = toScored(dump.eval);
  let labelCount = 0;
  if (labelsPath) {
    const labels = await Effect.runPromise(loadLiveAdjudicationLabelsFromJsonFile(labelsPath));
    labelCount = labels.length;
    const gt = new Map(labels.map((l) => [l.caseId, l.groundTruthCandidateId]));
    evalRows = rematchGroundTruth(evalRows, gt);
  }
  const transform: CalibrationTransform = {
    mode: "temperature_softmax",
    temperature: DECIDE_T,
  };
  const forced = metricsAt(evalRows, null);
  const reject = metricsAt(applyCalib(evalRows, transform), DECIDE_TAU);
  const report = {
    protocol: "Decide live-path score-once on frozen v0.6; twin-aware; confirmation suite",
    evalSuite: EVAL_SUITE,
    labelsPath: labelsPath ?? null,
    labelCount,
    groundTruthSource: labelsPath ? "frontier_labels" : "provisional_suite_gt",
    lockedKnobs: { mode: "temperature_softmax", temperature: DECIDE_T, tau: DECIDE_TAU },
    modelId: dump.modelId,
    backend: dump.backend,
    arms: [
      { arm: "decide_forced", ...forced, threshold: null, rejectRule: false },
      {
        arm: "decide_locked_T_tau",
        ...reject,
        threshold: DECIDE_TAU,
        calibration: transform,
        rejectRule: true,
      },
    ],
    confirmation: {
      nFired: reject.nFired,
      nErrorsFired: reject.nErrorsFired,
      cpLower95: reject.cpLower95,
      citeLb:
        reject.cpLower95 == null ? null : `≈${(reject.cpLower95 * 100).toFixed(0)}%`,
      liveCiteReference: "DECIDE_V06_CUTOVER.md (v0.5 twin-aware ≈92% @ 45/75)",
    },
    honesty: [
      "v0.6 is optional confirmation of the live Decide path — not a retune",
      "twins count as correct (CATALOG_TWIN_EQUIVALENCE)",
      "quote nFired and CP LB whenever citing precision among fired",
    ],
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.error(`wrote ${outPath}`);
}

const phase = process.argv[2];
if (phase === "score") await phaseScore();
else if (phase === "report") await phaseReport();
else {
  console.error("usage: compare-decide-v06-once.mts <score|report> …");
  process.exit(2);
}
