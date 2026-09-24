#!/usr/bin/env npx tsx
/**
 * §7 held-out adjudication runner.
 *
 * Default: dry-run adjudicator (echoes fixture GT with provenance).
 * Live: set CLAWQL_FAST_DECISION_JUDGE_URL (+ optional MODEL/TOKEN).
 *
 * Writes labels JSON (if --out) and prints validation reports.
 * Does NOT claim productionTrusted for dry-run alone — report fields say so.
 *
 * Usage:
 *   npx tsx scripts/run-held-out-adjudication.mts
 *   npx tsx scripts/run-held-out-adjudication.mts --out /tmp/labels.json
 */

import { writeFileSync } from "node:fs";
import { Effect, Layer } from "effect";
import {
  HeuristicFastDecisionScorerLive,
  adjudicateHeldOutSuite,
  applyAdjudicationLabels,
  defaultHeldOutSuite,
  frontierAdjudicatorLayerFromEnv,
  runHeldOutValidationSuite,
} from "clawql-core";

const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

const suite = defaultHeldOutSuite();
const adjLayer = frontierAdjudicatorLayerFromEnv();

const adj = await Effect.runPromise(
  adjudicateHeldOutSuite(suite).pipe(Effect.provide(adjLayer))
);

const labeled = applyAdjudicationLabels(suite, adj.labels);
const reports = await Effect.runPromise(
  runHeldOutValidationSuite(labeled).pipe(Effect.provide(HeuristicFastDecisionScorerLive))
);

const summary = {
  suiteId: suite.suiteId,
  adjudicationMode: adj.mode,
  judgeModel: adj.judgeModel,
  labelCount: adj.labels.length,
  reports: reports.map((r) => ({
    useSiteId: r.useSiteId,
    adjudicatedCount: r.adjudicatedCount,
    caseCount: r.caseCount,
    passedCriteria: r.passedCriteria,
    productionTrusted: r.productionTrusted,
    failureReasons: r.failureReasons,
  })),
  honesty:
    adj.mode === "dry-run"
      ? "dry-run labels are not frontier-judge verdicts; do not cite productionTrusted from this mode alone"
      : "live judge labels applied — productionTrusted still requires calibration criteria + live GLiNER scores",
};

if (outPath) {
  writeFileSync(
    outPath,
    JSON.stringify({ labels: adj.labels, cases: labeled.cases, summary }, null, 2) + "\n"
  );
  console.error(`wrote ${outPath}`);
}

console.log(JSON.stringify(summary, null, 2));
