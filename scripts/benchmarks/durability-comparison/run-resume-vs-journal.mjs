#!/usr/bin/env node
/**
 * Tier F: resume wall time vs journal length.
 * Env: DURABILITY_RESUME_JOURNAL_STEPS (default 10,50,200,500),
 *      DURABILITY_RESUME_JOURNAL_PATH
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const tsEntry = join(
  repoRoot,
  "packages/clawql-api/src/program/durability-comparison/resume-vs-journal-cli.ts"
);
const outPath =
  process.env.DURABILITY_RESUME_JOURNAL_PATH ||
  join(repoRoot, "docs/benchmarks/durability-proof/resume-vs-journal/evidence.json");

mkdirSync(dirname(outPath), { recursive: true });

const res = spawnSync(process.execPath, ["--import", "tsx", tsEntry, outPath], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});
process.exit(res.status === 0 ? 0 : (res.status ?? 1));
