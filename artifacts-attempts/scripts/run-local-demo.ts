#!/usr/bin/env npx tsx
import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";
import { toBoardTaskView, writeDemoSnapshot } from "./board-view.js";

const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-run");
const mode = process.env.DECISIONS_MODE === "openai" ? "openai" : "calibrated";

const result = await runLocalDemo({ root, decisionsMode: mode, approveIfNeeded: true });
const snapPath = writeDemoSnapshot(root, result, toBoardTaskView(result));
console.log(
  JSON.stringify(
    {
      task: result.task.id,
      status: result.task.status,
      winner: result.decision.winner,
      autoMerge: result.autoMerge,
      approvalUsed: result.approvalUsed,
      blocked: result.attempts.filter((a) => a.status === "blocked").map((a) => a.id),
      mainCommit: result.mainCommit,
      arweaveId: result.arweaveId,
      manifestPath: result.manifestPath,
      notesPath: result.notesPath,
      canaryPercent: result.canaryPercent,
      canaryStatusPath: result.canaryStatusPath,
      snapshot: snapPath,
      verifyNotes: `node cli/verify/dist/cli.js --notes ${result.notesPath}`,
      verifyRelease: `node cli/verify/dist/cli.js --local-manifest ${result.manifestPath} --bundle-dir <main-wt files>`,
      verifyCanary: `node cli/verify/dist/cli.js --canary ${result.canaryStatusPath}`,
      board: "npm run board:serve && npm run board:hydrate-from",
    },
    null,
    2
  )
);
