#!/usr/bin/env node
/**
 * Harness² × ClawQL adversarial gate — step 2 preflight (scaffold).
 *
 * Does not run upstream Harness² or claim a scoreboard. Checks that the frozen
 * board choice is documented and, when HARNESS2_ROOT is set, that the upstream
 * CLI + JobBench setup look present.
 *
 * Usage:
 *   npm run benchmark:harness2-gate-adversarial:step2-preflight
 *   HARNESS2_ROOT=/path/to/harness2 npm run benchmark:harness2-gate-adversarial:step2-preflight
 */
import { existsSync, readFileSync, accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const STEP2_MD = join(ROOT, "docs/benchmarks/harness2-gate-adversarial/STEP2.md");
const SPEC_MD = join(ROOT, "docs/benchmarks/harness2-gate-adversarial/SPEC.md");

const FROZEN = {
  bench: "jb",
  benchName: "JobBench",
  mode: "sequential",
  k: 2,
  substrate: "opencode",
};

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

if (!existsSync(STEP2_MD)) fail(`missing ${STEP2_MD}`);
if (!existsSync(SPEC_MD)) fail(`missing ${SPEC_MD}`);

const step2 = readFileSync(STEP2_MD, "utf8");
const spec = readFileSync(SPEC_MD, "utf8");

if (!step2.includes("JobBench") || !step2.includes("`--bench jb`")) {
  fail("STEP2.md must freeze JobBench (--bench jb)");
}
if (!spec.includes("JobBench") || !/frozen|first publish/i.test(spec)) {
  fail("SPEC.md must document the frozen JobBench first-publish choice");
}
ok(`frozen board documented: ${FROZEN.benchName} (${FROZEN.bench}), mode=${FROZEN.mode}, k=${FROZEN.k}`);

const harnessRoot = process.env.HARNESS2_ROOT?.trim();
if (!harnessRoot) {
  ok("HARNESS2_ROOT unset — docs-only preflight (no upstream CLI check)");
  console.log(
    JSON.stringify(
      {
        kind: "harness2_gate_adversarial_step2_preflight",
        upstream_checked: false,
        frozen: FROZEN,
        next: "Clone google-research/harness2, harness2-setup jb, export HARNESS2_ROOT, re-run preflight",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const root = resolve(harnessRoot);
if (!existsSync(root)) fail(`HARNESS2_ROOT does not exist: ${root}`);

const which = spawnSync("bash", ["-lc", "command -v harness2"], {
  encoding: "utf8",
  env: process.env,
});
const harness2Bin = which.stdout?.trim();
if (which.status !== 0 || !harness2Bin) {
  fail("harness2 not on PATH (install upstream per SETUP.md)");
}
ok(`harness2 on PATH: ${harness2Bin}`);

const check = spawnSync(
  "harness2-check",
  ["--bench", FROZEN.bench],
  { encoding: "utf8", cwd: root, env: process.env },
);
if (check.status !== 0) {
  console.error(check.stdout || "");
  console.error(check.stderr || "");
  fail(`harness2-check --bench ${FROZEN.bench} failed (run harness2-setup jb)`);
}
ok(`harness2-check --bench ${FROZEN.bench} passed`);

// Best-effort: ensure we can read the checkout (permissions).
try {
  accessSync(root, constants.R_OK);
} catch {
  fail(`cannot read HARNESS2_ROOT: ${root}`);
}

console.log(
  JSON.stringify(
    {
      kind: "harness2_gate_adversarial_step2_preflight",
      upstream_checked: true,
      harness2_root: root,
      harness2_bin: harness2Bin,
      frozen: FROZEN,
      next: "Equal-arm runs: passthrough vs ClawQL MCP; then harness2-judge + harness2-report; write results-step2.json",
    },
    null,
    2,
  ),
);
process.exit(0);
