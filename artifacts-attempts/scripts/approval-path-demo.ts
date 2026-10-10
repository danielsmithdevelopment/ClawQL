#!/usr/bin/env npx tsx
/**
 * End-to-end uncalibrated path: local demo (openai mode) → hydrate board → approve.
 * Requires board:serve already running on ATTEMPTS_API.
 *
 *   npm run board:serve          # terminal A
 *   npm run demo:approval-path   # terminal B
 */

import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";
import { applyDecision, localOpenAIShapedDecision } from "@artifacts-attempts/decider";

const API = process.env.ATTEMPTS_API ?? "http://127.0.0.1:8787";
const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/approval-demo");

const result = await runLocalDemo({
  root,
  decisionsMode: "openai",
  approveIfNeeded: true,
});

const trust = applyDecision(localOpenAIShapedDecision(result.decision.winner ?? "att_1"), {
  testsFailed: 0,
  policyClean: true,
});
if (trust.autoMerge) {
  throw new Error("expected uncalibrated path to require approval");
}

const canarySlice = result.canary.versions.find((v) => v.label === "canary");
const previousSlice = result.canary.versions.find((v) => v.label === "previous");
const view = {
  task: { ...result.task, status: "awaiting_approval" },
  attempts: result.attempts,
  notes: result.notes,
  decision: result.decision,
  pendingApproval: true,
  arweaveId: result.arweaveId,
  canary: {
    mode: result.canary.mode,
    canaryPercent: canarySlice?.percentage ?? result.canaryPercent,
    previousPercent: previousSlice?.percentage ?? 100 - result.canaryPercent,
    rollbackTrigger: result.canary.rollbackTrigger,
    versionId: canarySlice?.versionId ?? "",
  },
};

const post = await fetch(`${API}/tasks`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ repo: result.task.repo, prompt: result.task.prompt, view }),
});
if (!post.ok) {
  console.error(await post.text());
  process.exit(1);
}

const approve = await fetch(`${API}/tasks/${encodeURIComponent(result.task.id)}/approve`, {
  method: "POST",
});
if (!approve.ok) {
  console.error(await approve.text());
  process.exit(1);
}

const after = await fetch(`${API}/tasks/${encodeURIComponent(result.task.id)}`);
const body = await after.json();

console.log(
  JSON.stringify(
    {
      board: `${API}/?task=${result.task.id}`,
      approvePage: `${API}/approve.html?task=${result.task.id}`,
      trustReason: trust.reason,
      pendingBeforeApprove: true,
      statusAfterApprove: body.task?.status,
      winner: result.decision.winner,
    },
    null,
    2
  )
);
