#!/usr/bin/env npx tsx
/**
 * §7 held-out adjudication runner.
 *
 * Default: dry-run adjudicator (echoes fixture GT with provenance).
 * Live judge: set CLAWQL_FAST_DECISION_JUDGE_URL (+ optional MODEL/TOKEN).
 *
 * Scorer: GLiNER2 primary via CLAWQL_FAST_DECISION_GLINER_URL (live HTTP).
 * Without the URL the scorer reports honest `gliner2-stub` (never heuristic-
 * as-primary). productionTrusted still requires live judge labels + criteria.
 *
 * Usage:
 *   npx tsx scripts/run-held-out-adjudication.mts
 *   npx tsx scripts/run-held-out-adjudication.mts --out /tmp/labels.json
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
  runHeldOutValidationSuite,
} from "clawql-core";

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

const suite = defaultHeldOutSuite();
const adjLayer = frontierAdjudicatorLayerFromEnv();
/** Primary scorer — live HTTP when CLAWQL_FAST_DECISION_GLINER_URL is set. */
const scorerLayer = createGlinerFastDecisionScorerLayer();
const glinerLiveConfigured = glinerEndpointConfigured();

const adj = await Effect.runPromise(adjudicateHeldOutSuite(suite).pipe(Effect.provide(adjLayer)));

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
    adj.mode === "dry-run"
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
    JSON.stringify({ labels: adj.labels, cases: labeled.cases, summary }, null, 2) + "\n"
  );
  console.error(`wrote ${outPath}`);
}

console.log(JSON.stringify(summary, null, 2));
