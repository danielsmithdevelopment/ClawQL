#!/usr/bin/env npx tsx
/**
 * Overnight Fast Decision calibration / packing experiments.
 *
 * Integrity:
 * - Fit temperature / transforms on Harvey v0.2 routing (or other fit suite).
 * - Evaluate on frozen v0.3 routing-fresh (spent for hint tuning; OK for calib eval
 *   when T was not fit on v0.3).
 * - Enrichment stays off unless explicitly ablated.
 *
 * Usage:
 *   npx tsx scripts/overnight-fast-decision-calib.mts
 *   npx tsx scripts/overnight-fast-decision-calib.mts --phase dump
 *   npx tsx scripts/overnight-fast-decision-calib.mts --phase grid
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
} from "../packages/clawql-core/src/classifier/index.ts";

const OUT_DIR = process.env.OVERNIGHT_CALIB_OUT ?? "/opt/cursor/artifacts/overnight-calib";
mkdirSync(OUT_DIR, { recursive: true });

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const phase = argValue("--phase") ?? "all";

async function scoreSuite(
  suiteName: string,
  useSiteId?: string
): Promise<{
  readonly backend: string;
  readonly scored: readonly ScoredHeldOutCase[];
  readonly rawAcc: number;
  readonly rawMce: number;
}> {
  delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  // Raw dumps must disable post-score calibration so grid fit sees native GLiNER peaks.
  process.env.CLAWQL_FAST_DECISION_CALIBRATION = "0";
  const suite = resolveHeldOutSuite(suiteName);
  const cases = useSiteId ? casesForUseSite(suite, useSiteId) : suite.cases;
  const layer = createGlinerFastDecisionScorerLayer();
  const { scored, backend } = await Effect.runPromise(
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const scored = yield* scoreHeldOutCases(cases);
      return { scored, backend: scorer.backendId() };
    }).pipe(Effect.provide(layer))
  );
  const site = useSiteId ?? "all";
  const cal = evaluateCorrectnessAndCalibration(
    site,
    scored.map((s) => ({
      caseId: s.caseId,
      groundTruthCandidateId: s.groundTruthCandidateId,
      scores: s.scores,
    })),
    DEFAULT_VALIDATION_CRITERIA
  );
  return {
    backend,
    scored,
    rawAcc: cal.rawAccuracy,
    rawMce: cal.meanCalibrationError,
  };
}

function applyToScored(
  scored: readonly ScoredHeldOutCase[],
  transform: CalibrationTransform
): readonly ScoredHeldOutCase[] {
  return scored.map((s) => {
    const scores = applyCalibrationToScores(s.scores, transform);
    const zeroSignal = scores.length > 0 && scores.every((x) => x.confidence <= 0);
    const top = zeroSignal ? undefined : [...scores].sort((a, b) => b.confidence - a.confidence)[0];
    return {
      ...s,
      scores,
      topCandidateId: top?.candidateId,
      topConfidence: top?.confidence,
      correct: Boolean(top && top.candidateId === s.groundTruthCandidateId),
    };
  });
}

function reportFor(
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

function confSummary(scored: readonly ScoredHeldOutCase[]) {
  const correct = scored.filter((s) => s.correct).map((s) => s.topConfidence ?? 0);
  const wrong = scored.filter((s) => !s.correct).map((s) => s.topConfidence ?? 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    nCorrect: correct.length,
    nWrong: wrong.length,
    meanConfCorrect: mean(correct),
    meanConfWrong: mean(wrong),
    minConfCorrect: correct.length ? Math.min(...correct) : null,
    minConfWrong: wrong.length ? Math.min(...wrong) : null,
    maxConfCorrect: correct.length ? Math.max(...correct) : null,
    maxConfWrong: wrong.length ? Math.max(...wrong) : null,
  };
}

function fitCasesFromScored(scored: readonly ScoredHeldOutCase[]) {
  return scored.map((s) => ({
    groundTruthCandidateId: s.groundTruthCandidateId,
    scores: s.scores as readonly FastDecisionScore[],
  }));
}

async function phaseDump(): Promise<void> {
  console.error("phase=dump scoring v0.3 (ontology off)…");
  const v03 = await scoreSuite("v0.3-routing-fresh", "search_provider_tool_routing");
  const dump = {
    suite: "v0.3-routing-fresh",
    backend: v03.backend,
    rawAcc: v03.rawAcc,
    rawMce: v03.rawMce,
    conf: confSummary(v03.scored),
    cases: v03.scored.map((s) => ({
      id: s.caseId,
      correct: s.correct,
      gt: s.groundTruthCandidateId,
      top: s.topCandidateId,
      conf: s.topConfidence,
      scores: s.scores,
    })),
  };
  writeFileSync(`${OUT_DIR}/v03-raw-dump.json`, `${JSON.stringify(dump, null, 2)}\n`);
  // Persist raw scored for later phases without re-hitting GLiNER
  writeFileSync(`${OUT_DIR}/v03-raw-scored.json`, `${JSON.stringify(v03.scored, null, 2)}\n`);
  console.error(`wrote ${OUT_DIR}/v03-raw-dump.json acc=${v03.rawAcc} mce=${v03.rawMce}`);

  console.error("phase=dump scoring harvey v0.2 (all use sites, for calib fit)…");
  const harvey = await scoreSuite("v0.2-harvey");
  writeFileSync(
    `${OUT_DIR}/harvey-raw-dump.json`,
    `${JSON.stringify(
      {
        suite: "v0.2-harvey",
        backend: harvey.backend,
        rawAcc: harvey.rawAcc,
        rawMce: harvey.rawMce,
        conf: confSummary(harvey.scored),
        cases: harvey.scored.map((s) => ({
          id: s.caseId,
          useSiteId: s.useSiteId,
          correct: s.correct,
          gt: s.groundTruthCandidateId,
          top: s.topCandidateId,
          conf: s.topConfidence,
          scores: s.scores,
        })),
      },
      null,
      2
    )}\n`
  );
  writeFileSync(`${OUT_DIR}/harvey-raw-scored.json`, `${JSON.stringify(harvey.scored, null, 2)}\n`);
  console.error(
    `wrote harvey dump n=${harvey.scored.length} acc=${harvey.rawAcc} mce=${harvey.rawMce}`
  );
}

async function phaseGrid(): Promise<void> {
  const { readFileSync, existsSync } = await import("node:fs");
  const v03Path = `${OUT_DIR}/v03-raw-scored.json`;
  const harveyPath = `${OUT_DIR}/harvey-raw-scored.json`;
  if (!existsSync(v03Path) || !existsSync(harveyPath)) {
    console.error("missing dumps — running dump first");
    await phaseDump();
  }
  const v03Scored = JSON.parse(readFileSync(v03Path, "utf8")) as ScoredHeldOutCase[];
  const harveyAll = JSON.parse(readFileSync(harveyPath, "utf8")) as ScoredHeldOutCase[];
  // Prefer full Harvey for T fit (more n); routing-only as secondary report.
  const fitPool = harveyAll;

  const modes: CalibrationTransform["mode"][] = [
    "temperature_softmax",
    "temperature_sigmoid",
    "margin",
    "temperature_margin",
  ];
  const results: Record<string, unknown>[] = [];

  for (const mode of modes) {
    const fit = Effect.runSync(
      fitTemperatureByGrid({
        cases: fitCasesFromScored(fitPool),
        mode,
        temperatures:
          mode === "margin"
            ? [1]
            : [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50],
        criteria: DEFAULT_VALIDATION_CRITERIA,
      })
    );
    const transform: CalibrationTransform = { mode, temperature: fit.temperature };
    const evalScored = applyToScored(v03Scored, transform);
    const cal = reportFor("search_provider_tool_routing", evalScored);
    const fitScored = applyToScored(fitPool, transform);
    const fitCal = reportFor("harvey_fit", fitScored);
    const row = {
      mode,
      temperature: fit.temperature,
      fitSuite: "v0.2-harvey-all",
      fitN: fitPool.length,
      fitAcc: fitCal.rawAccuracy,
      fitMce: fitCal.meanCalibrationError,
      fitPassed: fitCal.passed,
      evalSuite: "v0.3-routing-fresh",
      evalN: v03Scored.length,
      evalAcc: cal.rawAccuracy,
      evalMce: cal.meanCalibrationError,
      evalPassed: cal.passed,
      evalBuckets: cal.buckets,
      evalFailureReasons: cal.failureReasons,
      evalConf: confSummary(evalScored),
      gridBestFitMce: fit.meanCalibrationError,
    };
    results.push(row);
    console.error(
      `mode=${mode} T=${fit.temperature} evalAcc=${cal.rawAccuracy.toFixed(3)} evalMce=${cal.meanCalibrationError.toFixed(3)} passed=${cal.passed}`
    );
  }

  // Also: fit T directly minimizing eval MCE on v0.3 (CONTAMINATED for citation — diagnostic only)
  const contaminatedFit = Effect.runSync(
    fitTemperatureByGrid({
      cases: fitCasesFromScored(v03Scored),
      mode: "temperature_softmax",
      temperatures: [0.5, 1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100],
      criteria: DEFAULT_VALIDATION_CRITERIA,
    })
  );
  const contTransform: CalibrationTransform = {
    mode: "temperature_softmax",
    temperature: contaminatedFit.temperature,
  };
  const contEval = reportFor(
    "search_provider_tool_routing",
    applyToScored(v03Scored, contTransform)
  );
  results.push({
    mode: "temperature_softmax",
    temperature: contaminatedFit.temperature,
    fitSuite: "v0.3-routing-fresh (CONTAMINATED diagnostic)",
    tag: "contaminated-smoke",
    evalAcc: contEval.rawAccuracy,
    evalMce: contEval.meanCalibrationError,
    evalPassed: contEval.passed,
    evalBuckets: contEval.buckets,
    note: "Do not cite as held-out §7 pass. Upper bound if T were tuned on eval.",
  });

  // Identity baseline
  const baseline = reportFor("search_provider_tool_routing", v03Scored);
  const summary = {
    generatedAt: new Date().toISOString(),
    baseline: {
      evalAcc: baseline.rawAccuracy,
      evalMce: baseline.meanCalibrationError,
      evalPassed: baseline.passed,
      buckets: baseline.buckets,
      conf: confSummary(v03Scored),
    },
    results,
    // Prefer configs that pass BOTH fit and eval; then lowest eval MCE.
    bestClean: [...results]
      .filter((r) => r.tag !== "contaminated-smoke")
      .sort((a, b) => {
        const aFit = a.fitPassed === true ? 0 : 1;
        const bFit = b.fitPassed === true ? 0 : 1;
        if (aFit !== bFit) return aFit - bFit;
        const ap = a.evalPassed === true ? 0 : 1;
        const bp = b.evalPassed === true ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.evalMce as number) - (b.evalMce as number);
      })[0],
  };
  writeFileSync(`${OUT_DIR}/grid-results.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.error(`wrote ${OUT_DIR}/grid-results.json`);
}

async function main(): Promise<void> {
  if (phase === "dump") await phaseDump();
  else if (phase === "grid") await phaseGrid();
  else {
    await phaseDump();
    await phaseGrid();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
