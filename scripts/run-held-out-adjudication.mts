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
 *   npx tsx scripts/run-held-out-adjudication.mts --suite v0.2-harvey
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
  frontierAdjudicatorLayerFromEnv,
  glinerEndpointConfigured,
  loadLiveAdjudicationLabelsFromJsonFile,
  resolveHeldOutSuite,
  runHeldOutValidationSuite,
  DEFAULT_VALIDATION_CRITERIA,
  loadClawqlCapabilityOntology,
  capabilityOntologyDigest,
  ontologyEnrichmentEnabled,
  type AdjudicationLabel,
  type AdjudicationRunReport,
} from "clawql-core";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const outPath = argValue("--out");
const labelsInPath = argValue("--labels-in");
const suiteArg = argValue("--suite");

const suite = resolveHeldOutSuite(suiteArg);
console.error(`suite=${suite.suiteId} cases=${suite.cases.length}`);
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
    // Live / labels-in path uses production DEFAULT criteria (not wiring).
    const reports = yield* runHeldOutValidationSuite(labeled, DEFAULT_VALIDATION_CRITERIA);
    return { reports, scorerBackend: scorer.backendId() };
  }).pipe(Effect.provide(scorerLayer))
);

const anyProductionTrusted = reports.some((r) => r.productionTrusted);
const candidateIdRemaps = adj.labels
  .filter((l) => l.candidateIdRemap)
  .map((l) => ({
    caseId: l.caseId,
    before: l.candidateIdRemap!.before,
    after: l.candidateIdRemap!.after,
    kind: l.candidateIdRemap!.kind,
  }));
let ontologyDigest: string | null = null;
if (ontologyEnrichmentEnabled()) {
  try {
    ontologyDigest = capabilityOntologyDigest(loadClawqlCapabilityOntology());
  } catch {
    ontologyDigest = null;
  }
}
const summary = {
  suiteId: suite.suiteId,
  adjudicationMode: adj.mode,
  judgeModel: adj.judgeModel,
  labelCount: adj.labels.length,
  labelsIn: labelsInPath ?? null,
  scorerBackend,
  glinerLiveConfigured,
  ontologyEnrichment: ontologyEnrichmentEnabled(),
  ontologyDigest,
  validationCriteria: DEFAULT_VALIDATION_CRITERIA,
  candidateIdRemapPolicy:
    "cosmetic-only (quote/case); semantic label/suffix remaps fail the case — never counted",
  candidateIdRemaps,
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
    cases: r.cases.map((c) => ({
      caseId: c.caseId,
      topCandidateId: c.topCandidateId ?? null,
      topConfidence: c.topConfidence ?? null,
      correct: c.correct,
    })),
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
    `productionTrusted requires DEFAULT_VALIDATION_CRITERIA (minAccuracy=${DEFAULT_VALIDATION_CRITERIA.minAccuracy}, maxMeanCalibrationError=${DEFAULT_VALIDATION_CRITERIA.maxMeanCalibrationError}) — wiring criteria cannot light the flag`,
    anyProductionTrusted
      ? "at least one use-site reports productionTrusted (live adjudicationKind + live gliner2 + DEFAULT criteria)"
      : "productionTrusted remains false until live adjudicationKind + live gliner2 backend + DEFAULT calibration criteria pass",
    candidateIdRemaps.length > 0
      ? `candidateIdRemaps=${candidateIdRemaps.length} cosmetic (logged before→after); semantic remaps fail closed`
      : "no candidateId remaps on this run",
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
