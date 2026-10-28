#!/usr/bin/env node
/**
 * Durable-agent density fair board (ClawQL TypeScript).
 *
 * Env: CLAWQL_DENSITY_* (see fair-board-cli.ts)
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/density/fair-board-cli.ts"
);
const outPath =
  process.env.CLAWQL_DENSITY_EVIDENCE_PATH ||
  join(repoRoot, "docs/benchmarks/program-density/evidence-fair.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(process.execPath, ["--import", "tsx", tsEntry, outPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
process.exit(res.status === 0 ? 0 : res.status ?? 1);
