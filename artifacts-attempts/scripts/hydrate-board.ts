#!/usr/bin/env npx tsx
/**
 * Run local demo, then POST the TaskView into the API so the board can show it.
 *
 *   npm run demo:local
 *   ATTEMPTS_API=http://127.0.0.1:8787 npm run board:hydrate
 */

import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";

const API = process.env.ATTEMPTS_API ?? "http://127.0.0.1:8787";
const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-run");

const result = await runLocalDemo({
  root,
  decisionsMode: process.env.DECISIONS_MODE === "openai" ? "openai" : "calibrated",
  approveIfNeeded: true,
});

const canarySlice = result.canary.versions.find((v) => v.label === "canary");
const previousSlice = result.canary.versions.find((v) => v.label === "previous");
const view = {
  task: result.task,
  attempts: result.attempts,
  notes: result.notes,
  decision: result.decision,
  pendingApproval: result.approvalUsed && result.task.status !== "released",
  arweaveId: result.arweaveId,
  canary: {
    mode: result.canary.mode,
    canaryPercent: canarySlice?.percentage ?? result.canaryPercent,
    previousPercent: previousSlice?.percentage ?? 100 - result.canaryPercent,
    rollbackTrigger: result.canary.rollbackTrigger,
    versionId: canarySlice?.versionId ?? "",
  },
};

const res = await fetch(`${API}/tasks`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    repo: result.task.repo,
    prompt: result.task.prompt,
    view,
  }),
});
if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}
const body = await res.json();
console.log(JSON.stringify({ board: `${API}/?task=${result.task.id}`, task: body.task ?? result.task }, null, 2));
