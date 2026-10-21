/**
 * CLI: run kill-mid-write board and write evidence JSON.
 * Usage: node --import tsx packages/clawql-api/src/program/kill-mid-write-board-cli.ts [outPath]
 */
import { Effect } from "effect";
import {
  defaultKillMidWriteEvidencePath,
  runKillMidWriteBoardEffect,
  writeKillMidWriteEvidence,
} from "./kill-mid-write-board.js";

const out = process.argv[2] ?? defaultKillMidWriteEvidencePath();
const evidence = await Effect.runPromise(runKillMidWriteBoardEffect());
const path = writeKillMidWriteEvidence(evidence, out);
console.log(
  `kill-mid-write: n=${evidence.n} ok=${evidence.trialsOk} fail=${evidence.trialsFailed} duplicates=${evidence.duplicateSideEffects} board_pass=${evidence.boardPass}`
);
console.log(`wrote ${path}`);
process.exit(evidence.boardPass ? 0 : 1);
