#!/usr/bin/env npx tsx
/**
 * v0.3 dual-arm score — reports only the pre-registered readout fields.
 * @see packages/clawql-core/src/classifier/held-out/fixtures/V03_DUAL_ARM_READOUT_PREREGISTERED.md
 *
 * Usage:
 *   npx tsx scripts/score-v03-routing-fresh-dual-arm.mts
 */

import { writeFileSync } from "node:fs";
import { Effect } from "effect";
import {
  createGlinerFastDecisionScorerLayer,
  FastDecisionScorer,
  resolveHeldOutSuite,
  runHeldOutValidationSuite,
  DEFAULT_VALIDATION_CRITERIA,
  loadClawqlCapabilityOntology,
  capabilityOntologyDigest,
  casesForUseSite,
  type HeldOutCaseSpec,
  type ScoredHeldOutCase,
} from "clawql-core";

const SIBLING_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["mcp.memory_recall_title_flag_a", "mcp.memory_recall_title_flag_b"],
  ["mcp.data_query_cohort_count", "mcp.memory_recall_overbroad"],
  ["mcp.cache", "mcp.audit"],
  ["mcp.skills_list", "mcp.skills_get"],
  ["mcp.notify", "mcp.schedule"],
  ["mcp.search", "mcp.execute"],
];

const SHELL_BAIT_IDS = new Set(["tool.bash_workspace_hunt", "tool.generic_web_search"]);

function isSiblingCase(c: HeldOutCaseSpec): boolean {
  const ids = new Set(c.candidates.map((x) => x.candidateId));
  return SIBLING_PAIRS.some(([a, b]) => ids.has(a) && ids.has(b));
}

function isShellBaitCase(c: HeldOutCaseSpec): boolean {
  return c.candidates.some((x) => SHELL_BAIT_IDS.has(x.candidateId));
}

function accuracyOf(scored: readonly ScoredHeldOutCase[]): number {
  if (scored.length === 0) return 0;
  return scored.filter((s) => s.correct).length / scored.length;
}

async function scoreArm(ontologyOn: boolean): Promise<{
  readonly backend: string;
  readonly rawAccuracy: number;
  readonly meanCalibrationError: number;
  readonly scored: readonly ScoredHeldOutCase[];
  readonly ontologyDigest: string | null;
}> {
  if (ontologyOn) {
    delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  } else {
    process.env.CLAWQL_FAST_DECISION_ONTOLOGY = "0";
  }
  const suite = resolveHeldOutSuite("v0.3-routing-fresh");
  const layer = createGlinerFastDecisionScorerLayer();
  const { reports, scorerBackend } = await Effect.runPromise(
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const reports = yield* runHeldOutValidationSuite(suite, DEFAULT_VALIDATION_CRITERIA);
      return { reports, scorerBackend: scorer.backendId() };
    }).pipe(Effect.provide(layer))
  );
  const routing = reports.find((r) => r.useSiteId === "search_provider_tool_routing");
  if (!routing) throw new Error("missing search_provider_tool_routing report");
  let digest: string | null = null;
  if (ontologyOn) {
    digest = capabilityOntologyDigest(loadClawqlCapabilityOntology());
  }
  return {
    backend: scorerBackend,
    rawAccuracy: routing.rawAccuracy,
    meanCalibrationError: routing.meanCalibrationError,
    scored: routing.cases,
    ontologyDigest: digest,
  };
}

const suite = resolveHeldOutSuite("v0.3-routing-fresh");
const routingCases = casesForUseSite(suite, "search_provider_tool_routing");
const siblingIds = new Set(routingCases.filter(isSiblingCase).map((c) => c.caseId));
const shellIds = new Set(routingCases.filter(isShellBaitCase).map((c) => c.caseId));

console.error(`suite=${suite.suiteId} n=${routingCases.length} sibling=${siblingIds.size} shell=${shellIds.size}`);
console.error("scoring arm A (ontology off)…");
const armA = await scoreArm(false);
console.error(`armA backend=${armA.backend} acc=${armA.rawAccuracy} mce=${armA.meanCalibrationError}`);
console.error("scoring arm B (ontology on)…");
const armB = await scoreArm(true);
console.error(`armB backend=${armB.backend} acc=${armB.rawAccuracy} mce=${armB.meanCalibrationError}`);

const byA = new Map(armA.scored.map((s) => [s.caseId, s]));
const byB = new Map(armB.scored.map((s) => [s.caseId, s]));

const gains: string[] = [];
const regressions: string[] = [];
let unchangedCorrect = 0;
let unchangedIncorrect = 0;
for (const c of routingCases) {
  const a = byA.get(c.caseId);
  const b = byB.get(c.caseId);
  if (!a || !b) continue;
  if (!a.correct && b.correct) gains.push(c.caseId);
  else if (a.correct && !b.correct) regressions.push(c.caseId);
  else if (a.correct && b.correct) unchangedCorrect += 1;
  else unchangedIncorrect += 1;
}

function subsetAcc(scored: readonly ScoredHeldOutCase[], ids: ReadonlySet<string>): number {
  const sub = scored.filter((s) => ids.has(s.caseId));
  return accuracyOf(sub);
}

const readout = {
  suiteId: suite.suiteId,
  preregisteredReadout: "V03_DUAL_ARM_READOUT_PREREGISTERED.md",
  suiteFreezeDigest:
    "02aa28eaf9f4d74f41e048c6735484cfab80a57c9c73f5a85402809d57a700aa",
  ontologyDigestArmB: armB.ontologyDigest,
  scorerBackendArmA: armA.backend,
  scorerBackendArmB: armB.backend,
  full: {
    n: routingCases.length,
    armA: { accuracy: armA.rawAccuracy, mce: armA.meanCalibrationError },
    armB: { accuracy: armB.rawAccuracy, mce: armB.meanCalibrationError },
    accuracyDelta: armB.rawAccuracy - armA.rawAccuracy,
    mceDelta: armB.meanCalibrationError - armA.meanCalibrationError,
  },
  siblingPairSubset: {
    n: siblingIds.size,
    armA_accuracy: subsetAcc(armA.scored, siblingIds),
    armB_accuracy: subsetAcc(armB.scored, siblingIds),
  },
  shellBaitSubset: {
    n: shellIds.size,
    armA_accuracy: subsetAcc(armA.scored, shellIds),
    armB_accuracy: subsetAcc(armB.scored, shellIds),
  },
  flipMatrix: {
    gains: gains.length,
    regressions: regressions.length,
    unchanged_correct: unchangedCorrect,
    unchanged_incorrect: unchangedIncorrect,
    gainCaseIds: gains,
    regressionCaseIds: regressions,
  },
  honesty:
    "Provisional fixture GT (adjudicated=false). Not productionTrusted. Pre-registered readout locked before scores.",
};

const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "/opt/cursor/artifacts/v03-dual-arm-readout.json";
writeFileSync(outPath, `${JSON.stringify(readout, null, 2)}\n`);
console.log(JSON.stringify(readout, null, 2));
console.error(`wrote ${outPath}`);
