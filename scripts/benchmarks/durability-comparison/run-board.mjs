#!/usr/bin/env node
/**
 * Durability comparison board (dual columns × upstream modes).
 * Env: DURABILITY_COMPARISON_N (default 50), DURABILITY_COMPARISON_EVIDENCE_PATH
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/durability-comparison/board-cli.ts"
);
const outPath =
  process.env.DURABILITY_COMPARISON_EVIDENCE_PATH ||
  join(repoRoot, "docs/benchmarks/durability-proof/comparison/evidence.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(process.execPath, ["--import", "tsx", tsEntry, outPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
process.exit(res.status === 0 ? 0 : (res.status ?? 1));
