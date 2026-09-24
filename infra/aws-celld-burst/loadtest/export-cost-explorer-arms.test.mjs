#!/usr/bin/env node
/**
 * Fail-closed checks for export-cost-explorer-arms.sh (no live AWS required).
 * Run: node --test infra/aws-celld-burst/loadtest/export-cost-explorer-arms.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(DIR, "export-cost-explorer-arms.sh");

function run(env = {}) {
  return spawnSync("bash", [SCRIPT, "/tmp/ce-test-out"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("export-cost-explorer-arms fail-closed", () => {
  it("exits non-zero without START/END", () => {
    const r = run({
      CLAWQL_S13_START: "",
      CLAWQL_S13_END: "",
      AWS_ACCESS_KEY_ID: "distinct-from-sync",
      CLAWQL_SYNC_ACCESS_KEY_ID: "sync-only",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /CLAWQL_S13_START|aws CLI not found/);
  });

  it("refuses when AWS_ACCESS_KEY_ID equals CLAWQL_SYNC_ACCESS_KEY_ID", () => {
    const r = run({
      CLAWQL_S13_START: "2026-09-01",
      CLAWQL_S13_END: "2026-09-02",
      AWS_ACCESS_KEY_ID: "r2keysame",
      AWS_SECRET_ACCESS_KEY: "secret",
      CLAWQL_SYNC_ACCESS_KEY_ID: "r2keysame",
      CLAWQL_SYNC_SECRET_ACCESS_KEY: "secret",
      PATH: process.env.PATH,
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /R2 sync/);
  });

  it("CLAWQL_CE_* override bypasses R2 collision on AWS_* then fails closed without aws CLI", () => {
    const r = run({
      CLAWQL_S13_START: "2026-09-01",
      CLAWQL_S13_END: "2026-09-02",
      AWS_ACCESS_KEY_ID: "r2keysame",
      AWS_SECRET_ACCESS_KEY: "secret",
      CLAWQL_SYNC_ACCESS_KEY_ID: "r2keysame",
      CLAWQL_SYNC_SECRET_ACCESS_KEY: "secret",
      CLAWQL_CE_ACCESS_KEY_ID: "real-ce-key",
      CLAWQL_CE_SECRET_ACCESS_KEY: "real-ce-secret",
      PATH: "/usr/bin:/bin",
    });
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /R2 sync/);
    assert.match(r.stderr + r.stdout, /CLAWQL_CE_|aws CLI not found|sts get-caller-identity/);
  });

  it("refuses when CLAWQL_CE_* still equals CLAWQL_SYNC", () => {
    const r = run({
      CLAWQL_S13_START: "2026-09-01",
      CLAWQL_S13_END: "2026-09-02",
      AWS_ACCESS_KEY_ID: "r2keysame",
      AWS_SECRET_ACCESS_KEY: "secret",
      CLAWQL_SYNC_ACCESS_KEY_ID: "r2keysame",
      CLAWQL_SYNC_SECRET_ACCESS_KEY: "secret",
      CLAWQL_CE_ACCESS_KEY_ID: "r2keysame",
      CLAWQL_CE_SECRET_ACCESS_KEY: "secret",
      PATH: process.env.PATH,
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /R2 sync/);
  });
});
