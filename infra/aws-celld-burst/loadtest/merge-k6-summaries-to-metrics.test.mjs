/**
 * Fail-closed checks for merge-k6-summaries-to-metrics.mjs
 * Run: node --test infra/aws-celld-burst/loadtest/merge-k6-summaries-to-metrics.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(DIR, "merge-k6-summaries-to-metrics.mjs");

function sampleSummary(p99, drops) {
  return JSON.stringify({
    arm: "A",
    metrics: {
      http_req_duration: { values: { avg: 10, "p(99)": p99, max: p99 + 1 } },
      burst_dropped_or_failed: { values: { count: drops, rate: 0.01 } },
    },
  });
}

describe("merge-k6-summaries-to-metrics fail-closed", () => {
  it("exits non-zero without spike seconds", () => {
    const td = mkdtempSync(join(tmpdir(), "k6-merge-"));
    const a = join(td, "a.json");
    writeFileSync(a, sampleSummary(12, 0));
    const r = spawnSync(
      "node",
      [SCRIPT, "--arm-a", a, "--arm-b", a, "--arm-c", a, "--out", join(td, "m.json")],
      { encoding: "utf8" }
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /spike-b-seconds|Usage/);
  });

  it("exits non-zero when p(99) missing", () => {
    const td = mkdtempSync(join(tmpdir(), "k6-merge-"));
    const bad = join(td, "bad.json");
    writeFileSync(
      bad,
      JSON.stringify({
        metrics: {
          http_req_duration: { values: { avg: 1 } },
          burst_dropped_or_failed: { values: { count: 0 } },
        },
      })
    );
    const r = spawnSync(
      "node",
      [
        SCRIPT,
        "--arm-a",
        bad,
        "--arm-b",
        bad,
        "--arm-c",
        bad,
        "--spike-b-seconds",
        "1",
        "--spike-c-seconds",
        "1",
        "--out",
        join(td, "m.json"),
      ],
      { encoding: "utf8" }
    );
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /p\(99\)|missing/);
  });

  it("merges valid summaries with operator spike seconds", () => {
    const td = mkdtempSync(join(tmpdir(), "k6-merge-"));
    const a = join(td, "a.json");
    const b = join(td, "b.json");
    const c = join(td, "c.json");
    writeFileSync(a, sampleSummary(12, 0));
    writeFileSync(b, sampleSummary(800, 120));
    writeFileSync(c, sampleSummary(200, 10));
    const out = join(td, "metrics.json");
    const r = spawnSync(
      "node",
      [
        SCRIPT,
        "--arm-a",
        a,
        "--arm-b",
        b,
        "--arm-c",
        c,
        "--spike-b-seconds",
        "45",
        "--spike-c-seconds",
        "20",
        "--out",
        out,
      ],
      { encoding: "utf8" }
    );
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(m.armA.p99Ms, 12);
    assert.equal(m.armA.drops, 0);
    assert.equal(m.armB.p99Ms, 800);
    assert.equal(m.armB.spikeSeconds, 45);
    assert.equal(m.armB.drops, 120);
    assert.equal(m.armC.p99Ms, 200);
    assert.equal(m.armC.spikeSeconds, 20);
    assert.equal(m.armC.drops, 10);
  });
});
