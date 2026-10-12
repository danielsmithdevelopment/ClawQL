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
import { postBoardView, toBoardTaskView, writeDemoSnapshot } from "./board-view.js";

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

const view = toBoardTaskView(result, {
  pendingApproval: true,
  taskStatus: "awaiting_approval",
});
writeDemoSnapshot(root, result, view);
await postBoardView(API, view);

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
