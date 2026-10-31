/**
 * CLI: durability comparison board → evidence JSON + package manifest.
 * Usage: node --import tsx packages/clawql-api/src/program/durability-comparison/board-cli.ts [outPath]
 */
import { Effect } from "effect";
import {
  defaultComparisonEvidencePath,
  defaultComparisonManifestPath,
  runDurabilityComparisonBoardEffect,
  writeComparisonEvidence,
  writeComparisonManifest,
} from "./board.js";

const out = process.argv[2] ?? defaultComparisonEvidencePath();
const evidence = await Effect.runPromise(runDurabilityComparisonBoardEffect());
const path = writeComparisonEvidence(evidence, out);
const manifestPath = writeComparisonManifest(evidence, defaultComparisonManifestPath());
const clawql = evidence.arms.find(
  (a) => a.armId === "clawql-file-journal" && a.crashPhase === "during_call"
);
const modes = clawql?.modes
  .map(
    (m) =>
      `${m.upstreamMode}:n=${m.n}/dup=${m.duplicates}/unk=${m.outcomeUnknown}/intent=${m.intentPresentOnResume}/sent=${m.callVerifiedSent}/pass=${m.boardPass}`
  )
  .join(" ");
const rowSummary = evidence.arms
  .map((a) => `${a.armId}@${a.crashPhase ?? "?"}:${a.status}`)
  .join(" ");
console.log(
  `durability-comparison: package=${evidence.packageId} tip=${evidence.tipRuntime}@${evidence.tipRuntimeVersion} harness=${evidence.harnessCommit.slice(0, 12)} defaultN=${evidence.defaultN} clawqlBoardPass=${evidence.clawqlBoardPass}`
);
console.log(`rows: ${rowSummary}`);
console.log(`clawql-file-journal: ${modes ?? ""}`);
console.log(`wrote ${path}`);
console.log(`wrote ${manifestPath}`);
if (!evidence.clawqlBoardPass) process.exit(1);
