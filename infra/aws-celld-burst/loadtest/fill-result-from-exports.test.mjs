#!/usr/bin/env node
/**
 * Fail-closed unit tests for fill-result-from-exports.mjs
 * Run: node --test infra/aws-celld-burst/loadtest/fill-result-from-exports.test.mjs
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./fill-result-from-exports.mjs", import.meta.url));

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    cwd,
  });
}

const metrics = {
  armA: { p99Ms: 12, drops: 0 },
  armB: { p99Ms: 800, spikeSeconds: 45, drops: 120 },
  armC: { p99Ms: 200, spikeSeconds: 20, drops: 10 },
};

describe("fill-result-from-exports fail-closed", () => {
  it("exits non-zero on non-numeric cost", () => {
    const dir = mkdtempSync(join(tmpdir(), "fill-bad-"));
    try {
      writeFileSync(join(dir, "a.csv"), "UnblendedCost\nabc\n");
      writeFileSync(join(dir, "b.csv"), "UnblendedCost\n1\n");
      writeFileSync(join(dir, "c.csv"), "UnblendedCost\n1\n");
      writeFileSync(join(dir, "m.json"), JSON.stringify(metrics));
      const r = run(
        [
          "--arm-a",
          join(dir, "a.csv"),
          "--arm-b",
          join(dir, "b.csv"),
          "--arm-c",
          join(dir, "c.csv"),
          "--metrics",
          join(dir, "m.json"),
          "--out",
          join(dir, "out.md"),
        ],
        dir
      );
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /non-numeric cost/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when metrics invent nothing (missing p99)", () => {
    const dir = mkdtempSync(join(tmpdir(), "fill-miss-"));
    try {
      writeFileSync(join(dir, "a.csv"), "UnblendedCost\n1.5\n");
      writeFileSync(join(dir, "b.csv"), "UnblendedCost\n0.5\n");
      writeFileSync(join(dir, "c.csv"), "UnblendedCost\n1.0\n");
      writeFileSync(join(dir, "m.json"), JSON.stringify({ armA: { drops: 0 } }));
      const r = run(
        [
          "--arm-a",
          join(dir, "a.csv"),
          "--arm-b",
          join(dir, "b.csv"),
          "--arm-c",
          join(dir, "c.csv"),
          "--metrics",
          join(dir, "m.json"),
          "--out",
          join(dir, "out.md"),
        ],
        dir
      );
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /armA\.p99Ms/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fills \$Y from CSVs when inputs are valid", () => {
    const dir = mkdtempSync(join(tmpdir(), "fill-ok-"));
    try {
      writeFileSync(join(dir, "a.csv"), "UnblendedCost\n1.25\n2.75\n");
      writeFileSync(join(dir, "b.csv"), "UnblendedCost\n0.50\n");
      writeFileSync(join(dir, "c.csv"), "UnblendedCost\n1.00\n");
      writeFileSync(join(dir, "m.json"), JSON.stringify(metrics));
      const out = join(dir, "out.md");
      const r = run(
        [
          "--arm-a",
          join(dir, "a.csv"),
          "--arm-b",
          join(dir, "b.csv"),
          "--arm-c",
          join(dir, "c.csv"),
          "--metrics",
          join(dir, "m.json"),
          "--out",
          out,
        ],
        dir
      );
      assert.equal(r.status, 0, r.stderr);
      const md = readFileSync(out, "utf8");
      assert.match(md, /\$4 real AWS cost/);
      assert.match(md, /\$0\.5 real AWS cost/);
      assert.match(md, /\$1 real AWS cost/);
      assert.match(md, /p99 latency 12ms/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
