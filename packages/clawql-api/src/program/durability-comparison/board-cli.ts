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
const clawql = evidence.arms.find((a) => a.armId === "clawql-file-journal");
const modes = clawql?.modes
  .map(
    (m) =>
      `${m.upstreamMode}:dup=${m.duplicates}/unk=${m.outcomeUnknown}/intent=${m.intentPresentOnResume}/sent=${m.callVerifiedSent}/pass=${m.boardPass}`
  )
  .join(" ");
console.log(
  `durability-comparison: package=${evidence.packageId} tip=${evidence.tipRuntime}@${evidence.tipRuntimeVersion} clawqlBoardPass=${evidence.clawqlBoardPass} ${modes ?? ""}`
);
console.log(`wrote ${path}`);
console.log(`wrote ${manifestPath}`);
if (!evidence.clawqlBoardPass) process.exit(1);
