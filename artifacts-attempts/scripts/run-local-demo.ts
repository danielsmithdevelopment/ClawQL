#!/usr/bin/env npx tsx
import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";

const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-run");
const mode = process.env.DECISIONS_MODE === "openai" ? "openai" : "calibrated";

const result = await runLocalDemo({ root, decisionsMode: mode, approveIfNeeded: true });
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
      verifyNotes: `node cli/verify/dist/cli.js --notes ${result.notesPath}`,
      verifyRelease: `node cli/verify/dist/cli.js --local-manifest ${result.manifestPath} --bundle-dir <main-wt files>`,
      board: "npm run board:serve && npm run board:hydrate",
    },
    null,
    2
  )
);
