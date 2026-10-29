/**
 * CLI: companion crash-points board (ClawQL file-journal).
 * Usage: node --import tsx crash-points-cli.ts [evidencePath]
 */

import { Effect } from "effect";
import {
  defaultCrashPointsEvidencePath,
  runCrashPointsBoardEffect,
  writeCrashPointsEvidence,
} from "./crash-points-board.js";
import { checkTrialTraces } from "./trace-conformance.js";

const outPath = process.argv[2] ?? defaultCrashPointsEvidencePath();

const evidence = await Effect.runPromise(runCrashPointsBoardEffect());
const path = writeCrashPointsEvidence(evidence, outPath);

let traceOk = true;
let traceChecked = 0;
const wantTrace = process.env.DURABILITY_COMPARISON_TRACE === "1";
if (wantTrace) {
  for (const row of evidence.rows) {
    for (const mode of row.modes) {
      const r = checkTrialTraces(mode.trials, {
        apiCapability: mode.apiCapability,
        structuralGate: true,
      });
      traceChecked += r.eventsChecked;
      if (!r.ok) {
        traceOk = false;
        console.error(
          `trace-conformance FAIL ${row.crashPoint}/${mode.upstreamMode}:`,
          r.violations
        );
      }
    }
  }
}

const summary = evidence.rows
  .map((row) => {
    const cells = row.modes
      .map(
        (m) =>
          `${m.upstreamMode}:${m.duplicates}/${m.interruptedOrUnknown}/${m.completedExactlyOnce}(n=${m.n},ok=${m.harnessValid})`
      )
      .join(" ");
    return `${row.crashPoint}[${cells}]`;
  })
  .join(" | ");

console.log(`crash-points: wrote ${path}`);
console.log(summary);
if (wantTrace) {
  console.log(`trace-conformance: checked=${traceChecked} ok=${traceOk}`);
  if (!traceOk) process.exit(1);
}

const allValid = evidence.rows.every((r) => r.modes.every((m) => m.harnessValid));
if (!allValid) {
  console.error("crash-points: one or more modes failed harnessValid");
  process.exit(1);
}
