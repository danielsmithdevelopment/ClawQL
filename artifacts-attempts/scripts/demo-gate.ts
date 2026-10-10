#!/usr/bin/env npx tsx
/**
 * Recording gate: local demo must pass N consecutive runs with verify witnesses.
 *
 *   npm run demo:gate
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runLocalDemo } from "@artifacts-attempts/pipeline";

const RUNS = Number(process.env.DEMO_GATE_RUNS ?? 3);
const rootBase = process.env.ATTEMPTS_LOCAL_ROOT ?? join(process.cwd(), ".local/demo-gate");

async function oneRun(i: number): Promise<void> {
  const root = join(rootBase, `run-${i}`);
  rmSync(root, { recursive: true, force: true });
  console.log(`\n=== demo gate run ${i}/${RUNS} ===`);
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
  copyFileSync(join(root, "main-wt/src/delivery.js"), join(bundle, "delivery.js"));
  copyFileSync(join(root, "main-wt/package.json"), join(bundle, "package.json"));
  execFileSync(
    "node",
    ["cli/verify/dist/cli.js", "--local-manifest", result.manifestPath, "--bundle-dir", bundle],
    { cwd: process.cwd(), stdio: "inherit" }
  );
  console.log(`OK run ${i}: main=${result.mainCommit.slice(0, 12)} arweave=${result.arweaveId}`);
}

async function main(): Promise<void> {
  execFileSync("npm", ["run", "build", "-w", "@artifacts-attempts/verify"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  for (let i = 1; i <= RUNS; i++) {
    await oneRun(i);
  }
  console.log(`\nGATE PASS: ${RUNS}/${RUNS} consecutive local demos verified.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
