/**
 * CLI: durability comparison board → evidence JSON.
 * Usage: node --import tsx packages/clawql-api/src/program/durability-comparison/board-cli.ts [outPath]
 */
import { Effect } from "effect";
import {
  defaultComparisonEvidencePath,
  runDurabilityComparisonBoardEffect,
  writeComparisonEvidence,
} from "./board.js";
import { checkTrialTraces } from "./trace-conformance.js";

const out = process.argv[2] ?? defaultComparisonEvidencePath();
const evidence = await Effect.runPromise(runDurabilityComparisonBoardEffect());
const path = writeComparisonEvidence(evidence, out);
function modeLine(
  armId: string,
  m: {
    upstreamMode: string;
    duplicates: number;
    interruptedOrUnknown: number;
    completedExactlyOnce: number;
    harnessValid: boolean;
  }
): string {
  return `${armId}/${m.upstreamMode}:dup=${m.duplicates}/unk=${m.interruptedOrUnknown}/once=${m.completedExactlyOnce}/harnessValid=${m.harnessValid}`;
}
const summary = evidence.arms
  .filter((a) => a.status === "measured")
  .flatMap((a) => a.modes.map((m) => modeLine(a.armId, m)))
  .join(" ");
console.log(
  `durability-comparison: crashPoint=${evidence.crashPoint} clawqlAtMostOnce=${evidence.clawqlAtMostOnce} ${summary}`
);
console.log(`wrote ${path}`);

if (process.env.DURABILITY_COMPARISON_TRACE === "1") {
  // Check ClawQL structural arms only — naive-retry / peer blind-retry are
  // deliberate counterexample shapes (NoDuplicateEffect), not product traces.
  const structuralArmIds = new Set([
    "clawql-file-journal",
    "clawql-always-retry",
    "clawql-check-then-decide",
    "clawql-check-then-decide-race",
  ]);
  let traceOk = true;
  let checked = 0;
  for (const arm of evidence.arms) {
    if (arm.status !== "measured" || !structuralArmIds.has(arm.armId)) continue;
    for (const mode of arm.modes) {
      const r = checkTrialTraces(mode.trials, {
        apiCapability: mode.apiCapability,
        structuralGate: true,
      });
      checked += r.eventsChecked;
      if (!r.ok) {
        traceOk = false;
        console.error(`trace-conformance FAIL ${arm.armId}/${mode.upstreamMode}:`, r.violations);
      }
    }
  }
  console.log(`trace-conformance: checked=${checked} ok=${traceOk}`);
  if (!traceOk) process.exit(1);
}

if (!evidence.clawqlAtMostOnce) process.exit(1);
