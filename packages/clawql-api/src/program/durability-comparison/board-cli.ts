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
const clawql = evidence.arms.find((a) => a.armId === "clawql-file-journal");
const modes = clawql?.modes
  .map((m) => `${m.upstreamMode}:dup=${m.duplicates}/unk=${m.outcomeUnknown}/pass=${m.boardPass}`)
  .join(" ");
console.log(`durability-comparison: clawqlBoardPass=${evidence.clawqlBoardPass} ${modes ?? ""}`);
console.log(`wrote ${path}`);
if (!evidence.clawqlBoardPass) process.exit(1);
