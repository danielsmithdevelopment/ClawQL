#!/usr/bin/env npx tsx
/**
 * One-shot prep before recording the competition video.
 *
 *   npm run demo:record-prep
 *
 * Runs demo:gate (3 verified demos). Exit 0 only on GATE PASS.
 */

import { execFileSync } from "node:child_process";

const runs = process.env.DEMO_GATE_RUNS ?? "3";
console.log(`record-prep: running demo:gate with DEMO_GATE_RUNS=${runs}`);
execFileSync("npm", ["run", "demo:gate"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: { ...process.env, DEMO_GATE_RUNS: runs },
});
console.log(`
record-prep OK — you may record.

Next:
  1. npm run board:serve
  2. npm run board:hydrate-from   (or board:hydrate / demo:approval-path)
  3. Show .local/demo-gate/run-3/.local/canary/status.json (or board canary panel)
  4. Follow docs/VIDEO_SCRIPT.md
  5. Submit per docs/SUBMISSION.md

Tip: judges can run npm run demo:judge-smoke for a single verified demo first.
`);
