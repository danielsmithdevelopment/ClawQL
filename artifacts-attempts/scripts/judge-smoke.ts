#!/usr/bin/env npx tsx
/**
 * Fast judge path: one local demo + verify notes/manifest/canary.
 * Prefer this for a 5-minute check; use demo:record-prep before filming.
 *
 *   npm run demo:judge-smoke
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { assertCanaryStatus, runLocalDemo, type CanaryStatus } from "@artifacts-attempts/pipeline";
import { toBoardTaskView, writeDemoSnapshot } from "./board-view.js";

const root = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/judge-smoke");

async function main(): Promise<void> {
  rmSync(root, { recursive: true, force: true });
  execFileSync("npm", ["run", "build", "-w", "@artifacts-attempts/verify"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  console.log("judge-smoke: running one local demo…");
  const result = await runLocalDemo({
    root,
    decisionsMode: "calibrated",
    approveIfNeeded: true,
  });

  if (result.attempts.find((a) => a.id === "att_3")?.status !== "blocked") {
    throw new Error("att_3 not blocked");
  }
  if (result.decision.winner !== "att_1") {
    throw new Error("expected winner att_1");
  }

  execFileSync("node", ["cli/verify/dist/cli.js", "--notes", result.notesPath], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  const bundle = join(root, "bundle-check");
  mkdirSync(bundle, { recursive: true });
  copyFileSync(join(root, "artifacts/main-wt/src/delivery.js"), join(bundle, "delivery.js"));
  copyFileSync(join(root, "artifacts/main-wt/package.json"), join(bundle, "package.json"));
  execFileSync(
    "node",
    ["cli/verify/dist/cli.js", "--local-manifest", result.manifestPath, "--bundle-dir", bundle],
    { cwd: process.cwd(), stdio: "inherit" }
  );
  execFileSync(
    "node",
    ["cli/verify/dist/cli.js", "--canary", result.canaryStatusPath, "--percent", "10"],
    { cwd: process.cwd(), stdio: "inherit" }
  );

  const canary = JSON.parse(readFileSync(result.canaryStatusPath, "utf8")) as CanaryStatus;
  const check = assertCanaryStatus(canary);
  if (!check.ok) throw new Error(check.reason);
  const snapPath = writeDemoSnapshot(root, result, toBoardTaskView(result));

  console.log(
    JSON.stringify(
      {
        ok: true,
        task: result.task.id,
        winner: result.decision.winner,
        mainCommit: result.mainCommit,
        notesPath: result.notesPath,
        manifestPath: result.manifestPath,
        canaryStatusPath: result.canaryStatusPath,
        snapshot: snapPath,
        board: `npm run board:serve && ATTEMPTS_LOCAL_ROOT=${root} npm run board:hydrate-from`,
        next: ["docs/JUDGE_RUNBOOK.md", "docs/VIDEO_SCRIPT.md", "npm run demo:record-prep"],
      },
      null,
      2
    )
  );
  console.log("\nJUDGE SMOKE PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
