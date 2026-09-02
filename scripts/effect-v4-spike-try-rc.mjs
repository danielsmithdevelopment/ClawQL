#!/usr/bin/env node
/**
 * Dry-run Effect v4 RC against Stage 1 packages (no lockfile commit).
 * Used by .github/workflows/effect-v4-spike.yml — failures are informational until Stage 1 lands.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  return r.status ?? 1;
}

console.log("Effect v4 RC spike — install @rc (no-save) and typecheck Stage 1\n");

const installStatus = run("npm", [
  "install",
  "effect@rc",
  "@effect/opentelemetry@rc",
  "@effect/platform@rc",
  "--no-save",
  "--legacy-peer-deps",
]);

if (installStatus !== 0) {
  console.error("\nRC install failed (peer conflicts expected before Stage 1 migration).");
  process.exit(0);
}

run("node", ["scripts/effect-v4-spike-inventory.mjs"]);

console.log("\nTypecheck Stage 1 (informational — may fail on v3 code + v4 types):\n");

const workspaces = ["clawql-core", "clawql-api"];
let anyFailed = false;
for (const ws of workspaces) {
  console.log(`--- npm run typecheck -w ${ws} ---`);
  const status = run("npm", ["run", "typecheck", "-w", ws]);
  if (status !== 0) anyFailed = true;
}

if (anyFailed) {
  console.log(
    "\nStage 1 typecheck failed on RC (expected until Context.Tag → Service migration). See #1034."
  );
} else {
  console.log("\nStage 1 typecheck passed on RC.");
}

process.exit(0);
