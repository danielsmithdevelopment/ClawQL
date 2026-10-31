/**
 * CLI: Tier F resume vs journal length probe.
 * Usage: node --import tsx resume-vs-journal-cli.ts [evidencePath]
 */

import { Effect } from "effect";
import {
  defaultResumeVsJournalEvidencePath,
  runResumeVsJournalEffect,
  writeResumeVsJournalEvidence,
} from "./resume-vs-journal.js";

const outPath = process.argv[2] ?? defaultResumeVsJournalEvidencePath();
const evidence = await Effect.runPromise(runResumeVsJournalEffect());
const path = writeResumeVsJournalEvidence(evidence, outPath);

const line = evidence.samples
  .map((s) => `n=${s.nSteps}:resumeMs=${s.resumeMs}/rec=${s.journalRecords}/ok=${s.ok}`)
  .join(" ");
console.log(`resume-vs-journal: wrote ${path}`);
console.log(line);
console.log(
  `resumeMsPerRecord=${evidence.resumeMsPerRecord} snapshotRecommended=${evidence.snapshotRecommended}`
);

if (evidence.samples.some((s) => !s.ok)) {
  console.error("resume-vs-journal: one or more samples failed");
  process.exit(1);
}
