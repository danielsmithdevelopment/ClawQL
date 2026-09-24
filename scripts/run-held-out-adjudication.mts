#!/usr/bin/env npx tsx
/**
 * §7 held-out adjudication runner.
 *
 * Default: dry-run adjudicator (echoes fixture GT with provenance).
 * Live judge: set CLAWQL_FAST_DECISION_JUDGE_URL (+ optional MODEL/TOKEN).
 * Replay live GHA labels: `--labels-in path.json` (fail-closed on dry-run provenance).
 *
 * Scorer: GLiNER2 primary via CLAWQL_FAST_DECISION_GLINER_URL (live HTTP).
 * Without the URL the scorer reports honest `gliner2-stub` (never heuristic-
 * as-primary). productionTrusted still requires live judge labels + criteria.
 *
 * Usage:
 *   npx tsx scripts/run-held-out-adjudication.mts
 *   npx tsx scripts/run-held-out-adjudication.mts --out /tmp/labels.json
 *   npx tsx scripts/run-held-out-adjudication.mts --labels-in artifacts/held-out-frontier-labels.json
 */

import { writeFileSync } from "node:fs";
import { Effect } from "effect";
import {
  FastDecisionScorer,
  createGlinerFastDecisionScorerLayer,
  adjudicateHeldOutSuite,
  applyAdjudicationLabels,
  defaultHeldOutSuite,
  frontierAdjudicatorLayerFromEnv,
  glinerEndpointConfigured,
  loadLiveAdjudicationLabelsFromJsonFile,
  runHeldOutValidationSuite,
  type AdjudicationLabel,
  type AdjudicationRunReport,
} from "clawql-core";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const outPath = argValue("--out");
const labelsInPath = argValue("--labels-in");

const suite = defaultHeldOutSuite();
/** Primary scorer — live HTTP when CLAWQL_FAST_DECISION_GLINER_URL is set. */
const scorerLayer = createGlinerFastDecisionScorerLayer();
const glinerLiveConfigured = glinerEndpointConfigured();

let adj: AdjudicationRunReport;
if (labelsInPath) {
  let labels: readonly AdjudicationLabel[];
  try {
    labels = await Effect.runPromise(loadLiveAdjudicationLabelsFromJsonFile(labelsInPath));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`--labels-in failed: ${msg}`);
    process.exit(1);
  }
  const labeledCases = applyAdjudicationLabels(suite, labels).cases;
  const judgeModel = labels[0]?.judgeModel ?? "labels-in";
  adj = {
    suiteId: suite.suiteId,
    judgeModel,
    mode: "live",
    labels,
    cases: labeledCases,
  };
  console.error(`loaded ${labels.length} live labels from ${labelsInPath}`);
} else {
  const adjLayer = frontierAdjudicatorLayerFromEnv();
  adj = await Effect.runPromise(adjudicateHeldOutSuite(suite).pipe(Effect.provide(adjLayer)));
}

const labeled = applyAdjudicationLabels(suite, adj.labels);
const { reports, scorerBackend } = await Effect.runPromise(
  Effect.gen(function* () {
    const scorer = yield* FastDecisionScorer;
    const reports = yield* runHeldOutValidationSuite(labeled);
    return { reports, scorerBackend: scorer.backendId() };
  }).pipe(Effect.provide(scorerLayer))
);

const anyProductionTrusted = reports.some((r) => r.productionTrusted);
const summary = {
  suiteId: suite.suiteId,
  adjudicationMode: adj.mode,
  judgeModel: adj.judgeModel,
  labelCount: adj.labels.length,
  labelsIn: labelsInPath ?? null,
  scorerBackend,
  glinerLiveConfigured,
  reports: reports.map((r) => ({
    useSiteId: r.useSiteId,
    adjudicatedCount: r.adjudicatedCount,
    caseCount: r.caseCount,
    passedCriteria: r.passedCriteria,
    productionTrusted: r.productionTrusted,
    scorerBackend: r.scorerBackend,
    meanCalibrationError: r.meanCalibrationError,
    rawAccuracy: r.rawAccuracy,
    failureReasons: r.failureReasons,
  })),
  honesty: [
    labelsInPath
      ? `live labels loaded from ${labelsInPath}`
      : adj.mode === "dry-run"
        ? "dry-run labels are not frontier-judge verdicts (cannot light productionTrusted)"
        : "live judge labels applied",
    glinerLiveConfigured
      ? `scorer=${scorerBackend} (CLAWQL_FAST_DECISION_GLINER_URL set)`
      : "scorer=gliner2-stub (set CLAWQL_FAST_DECISION_GLINER_URL for live scores)",
    anyProductionTrusted
      ? "at least one use-site reports productionTrusted (live adjudicationKind + live gliner2 + criteria)"
      : "productionTrusted remains false until live adjudicationKind + live gliner2 backend + calibration criteria pass",
  ].join("; "),
};

if (outPath) {
  writeFileSync(
    outPath,
    JSON.stringify(
      { labels: adj.labels as readonly AdjudicationLabel[], cases: labeled.cases, summary },
      null,
      2
    ) + "\n"
  );
  console.error(`wrote ${outPath}`);
}

console.log(JSON.stringify(summary, null, 2));
