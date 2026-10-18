#!/usr/bin/env node
/**
 * Local ADR 0015 kill-node stand-in demo CLI.
 * Runs three-arm file-journal SIGKILL resume and writes evidence JSON.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/kill-node-standin-demo-cli.ts"
);
const outPath =
  process.env.CLAWQL_KILL_NODE_EVIDENCE_PATH ||
  join(repoRoot, "docs/benchmarks/program-kill-node-standin/evidence.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(
  process.execPath,
  ["--import", "tsx", tsEntry, outPath],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  }
);
process.exit(res.status === 0 ? 0 : res.status ?? 1);
