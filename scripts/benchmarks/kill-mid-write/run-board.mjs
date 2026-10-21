#!/usr/bin/env node
/**
 * Security suite Tier D — kill-mid-write durability board.
 * Env: KILL_MID_WRITE_N (default 50), KILL_MID_WRITE_EVIDENCE_PATH
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/kill-mid-write-board-cli.ts"
);
const outPath =
  process.env.KILL_MID_WRITE_EVIDENCE_PATH ||
  join(repoRoot, "docs/benchmarks/security-suite/kill-mid-write/evidence.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(process.execPath, ["--import", "tsx", tsEntry, outPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
process.exit(res.status === 0 ? 0 : res.status ?? 1);
