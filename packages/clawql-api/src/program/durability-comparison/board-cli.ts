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
if (!evidence.clawqlAtMostOnce) process.exit(1);
