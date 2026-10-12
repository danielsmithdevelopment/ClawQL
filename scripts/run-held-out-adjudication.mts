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
 * Measure-only Decision-1 scorer (never lights productionTrusted):
 *   CLAWQL_HELD_OUT_SCORER=openrouter-decision-1
 *   (+ OPENROUTER_API_KEY). Prefer CLAWQL_FLIP_RATE_GATE=0 to bound spend.
 *
 * Measure-only Clef / Clef-Flash scorer (self-hostable; never lights trust):
 *   CLAWQL_HELD_OUT_SCORER=clef-flash   # or `clef`
 *   (+ CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for Workers AI measure,
 *    or CLAWQL_CLEF_SYSTEMONE_URL for self-host SGLang). Prefer FLIP_RATE_GATE=0.
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
import {
  createOpenRouterDecision1FastDecisionScorerLayer,
  OPENROUTER_DECISION1_SCORER_BACKEND_ID,
} from "../packages/clawql-inference/src/decision/openrouter-decision1-scorer.ts";
import { createClefFastDecisionScorerLayer } from "../packages/clawql-inference/src/decision/clef-fast-decision-scorer.ts";
import {
  clefBackendId,
  resolveClefVariant,
} from "../packages/clawql-inference/src/decision/remote-clef.ts";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const outPath = argValue("--out");
const labelsInPath = argValue("--labels-in");
const suiteArg = argValue("--suite");

const suite = resolveHeldOutSuite(suiteArg);
console.error(`suite=${suite.suiteId} cases=${suite.cases.length}`);
const heldOutScorer = (process.env.CLAWQL_HELD_OUT_SCORER ?? "").trim().toLowerCase();
const clefMeasure =
  heldOutScorer === "clef" ||
  heldOutScorer === "clef-flash" ||
  heldOutScorer === "cloudflare/clef" ||
  heldOutScorer === "cloudflare/clef-flash";
/** Default: GLiNER2. Opt-in remotes never light productionTrusted. */
const scorerLayer =
  heldOutScorer === "openrouter-decision-1"
    ? createOpenRouterDecision1FastDecisionScorerLayer()
    : clefMeasure
      ? createClefFastDecisionScorerLayer({
          variant: resolveClefVariant(
            heldOutScorer === "clef" || heldOutScorer === "cloudflare/clef"
              ? "clef"
              : process.env.CLAWQL_CLEF_MODEL?.trim() || "clef-flash"
          ),
        })
      : createGlinerFastDecisionScorerLayer();
const measureOnlyRemote = heldOutScorer === "openrouter-decision-1" || clefMeasure;
const glinerLiveConfigured = measureOnlyRemote ? false : glinerEndpointConfigured();
if (heldOutScorer === "openrouter-decision-1") {
  console.error(
    `scorer=${OPENROUTER_DECISION1_SCORER_BACKEND_ID} (measure-only; productionTrusted stays false)`
  );
} else if (clefMeasure) {
  const variant = resolveClefVariant(
    heldOutScorer === "clef" || heldOutScorer === "cloudflare/clef"
      ? "clef"
      : process.env.CLAWQL_CLEF_MODEL?.trim() || "clef-flash"
  );
  console.error(
    `scorer=${clefBackendId(variant)} (measure-only; productionTrusted stays false; prefer self-host)`
  );
}

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
    measureOnlyRemote
      ? `scorer=${scorerBackend} (CLAWQL_HELD_OUT_SCORER=${heldOutScorer}; measure-only)`
      : glinerLiveConfigured
        ? `scorer=${scorerBackend} (CLAWQL_FAST_DECISION_GLINER_URL set)`
        : "scorer=gliner2-stub (set CLAWQL_FAST_DECISION_GLINER_URL for live scores)",
    `productionTrusted requires DEFAULT_VALIDATION_CRITERIA (minAccuracy=${DEFAULT_VALIDATION_CRITERIA.minAccuracy}, maxMeanCalibrationError=${DEFAULT_VALIDATION_CRITERIA.maxMeanCalibrationError}) — wiring criteria cannot light the flag`,
    anyProductionTrusted
      ? "at least one use-site reports productionTrusted (live adjudicationKind + live gliner2 + DEFAULT criteria)"
      : measureOnlyRemote
        ? `productionTrusted remains false — measure scorer backend "${scorerBackend}" ≠ gliner2`
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
