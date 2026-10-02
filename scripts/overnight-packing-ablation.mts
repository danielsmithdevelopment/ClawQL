#!/usr/bin/env npx tsx
/**
 * Label-packing ablation on frozen v0.3 (enrichment off, calibration as configured).
 * Modes: full (default fixture labels), short (truncate desc 80), id_only.
 *
 * Does not retune ontology hints — packing only changes what goes in classify labels.
 */

import { writeFileSync } from "node:fs";
import { Effect } from "effect";
import {
  createGlinerFastDecisionScorerLayer,
  FastDecisionScorer,
  resolveHeldOutSuite,
  casesForUseSite,
  scoreHeldOutCases,
  evaluateCorrectnessAndCalibration,
  DEFAULT_VALIDATION_CRITERIA,
  readCalibrationConfigFromEnv,
  type FastDecisionCandidate,
  type ScoredHeldOutCase,
} from "../packages/clawql-core/src/classifier/index.ts";

type PackMode = "full" | "short" | "id_only";

function packCandidates(
  candidates: readonly FastDecisionCandidate[],
  mode: PackMode
): FastDecisionCandidate[] {
  return candidates.map((c) => {
    if (mode === "id_only") {
      return {
        candidateId: c.candidateId,
        features: { label: c.candidateId, description: c.candidateId },
      };
    }
    if (mode === "short") {
      const label = String(c.features.label ?? c.features.name ?? c.candidateId);
      const desc = String(c.features.description ?? label).slice(0, 80);
      return {
        candidateId: c.candidateId,
        features: { ...c.features, label: label.slice(0, 80), description: desc },
      };
    }
    return c;
  });
}

async function runMode(mode: PackMode): Promise<{
  mode: PackMode;
  backend: string;
  acc: number;
  mce: number;
  passed: boolean;
  calibration: ReturnType<typeof readCalibrationConfigFromEnv>;
}> {
  delete process.env.CLAWQL_FAST_DECISION_ONTOLOGY;
  // Keep production default calibration for packing compare
  const suite = resolveHeldOutSuite("v0.3-routing-fresh");
  const rawCases = casesForUseSite(suite, "search_provider_tool_routing");
  const cases = rawCases.map((c) => ({
    ...c,
    candidates: packCandidates(c.candidates, mode),
  }));
  const layer = createGlinerFastDecisionScorerLayer();
  const { scored, backend } = await Effect.runPromise(
    Effect.gen(function* () {
      const scorer = yield* FastDecisionScorer;
      const scored = yield* scoreHeldOutCases(cases);
      return { scored, backend: scorer.backendId() };
    }).pipe(Effect.provide(layer))
  );
  const cal = evaluateCorrectnessAndCalibration(
    "search_provider_tool_routing",
    scored.map((s: ScoredHeldOutCase) => ({
      caseId: s.caseId,
      groundTruthCandidateId: s.groundTruthCandidateId,
      scores: s.scores,
    })),
    DEFAULT_VALIDATION_CRITERIA
  );
  return {
    mode,
    backend,
    acc: cal.rawAccuracy,
    mce: cal.meanCalibrationError,
    passed: cal.passed,
    calibration: readCalibrationConfigFromEnv(),
  };
}

const modes: PackMode[] = ["full", "short", "id_only"];
const rows = [];
for (const m of modes) {
  console.error(`packing=${m}…`);
  const row = await runMode(m);
  console.error(`  acc=${row.acc} mce=${row.mce} passed=${row.passed} backend=${row.backend}`);
  rows.push(row);
}
const out = {
  generatedAt: new Date().toISOString(),
  suite: "v0.3-routing-fresh",
  note: "Packing ablation with default calibration (temperature_softmax T=3). Enrichment off.",
  rows,
};
writeFileSync(
  "/opt/cursor/artifacts/overnight-calib/packing-ablation.json",
  `${JSON.stringify(out, null, 2)}\n`
);
console.log(JSON.stringify(out, null, 2));
