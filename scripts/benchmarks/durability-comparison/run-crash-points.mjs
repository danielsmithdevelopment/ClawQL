#!/usr/bin/env node
/**
 * Companion crash-points board (ClawQL file-journal).
 * Env: DURABILITY_COMPARISON_CRASH_POINTS_N (default 5),
 *      DURABILITY_COMPARISON_CRASH_POINTS_PATH, DURABILITY_COMPARISON_TRACE=1
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/durability-comparison/crash-points-cli.ts"
);
const outPath =
  process.env.DURABILITY_COMPARISON_CRASH_POINTS_PATH ||
  join(repoRoot, "docs/benchmarks/durability-proof/comparison/crash-points-evidence.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(process.execPath, ["--import", "tsx", tsEntry, outPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
process.exit(res.status === 0 ? 0 : (res.status ?? 1));
