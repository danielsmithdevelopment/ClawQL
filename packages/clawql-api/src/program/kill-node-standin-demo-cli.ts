/**
 * CLI entry: node --import tsx …/kill-node-standin-demo-cli.ts [evidencePath]
 */
import { Effect } from "effect";
import {
  defaultKillNodeEvidencePath,
  runKillNodeStandinDemoEffect,
  writeKillNodeStandinEvidence,
} from "./kill-node-standin-demo.js";

const out = process.argv[2] || defaultKillNodeEvidencePath();
const evidence = await Effect.runPromise(runKillNodeStandinDemoEffect());
const path = writeKillNodeStandinEvidence(evidence, out);
console.log(JSON.stringify({ path, ok: evidence.ok, arms: evidence.arms.map((a) => ({ arm: a.arm, ok: a.ok })) }, null, 2));
console.log(evidence.honesty);
if (!evidence.ok) {
  for (const a of evidence.arms) {
    if (!a.ok) console.error(`FAIL ${a.arm}: ${a.detail}`);
  }
  process.exit(1);
}
console.log("kill-node-standin-demo: PASS");
