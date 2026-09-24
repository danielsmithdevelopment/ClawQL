/**
 * Fail-closed checks for fetch-celld-leases-from-s3.sh (no live AWS required).
 * Run: node --test infra/aws-celld-burst/fetch-celld-leases-from-s3.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(DIR, "fetch-celld-leases-from-s3.sh");

function run(env = {}) {
  return spawnSync("bash", [SCRIPT, "/tmp/celld-leases-test.json"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("fetch-celld-leases-from-s3 fail-closed", () => {
  it("exits non-zero without bucket", () => {
    const r = run({
      CLAWQL_CELLD_LEASE_BUCKET: "",
      AWS_ACCESS_KEY_ID: "distinct-from-sync",
      CLAWQL_SYNC_ACCESS_KEY_ID: "sync-only",
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /CLAWQL_CELLD_LEASE_BUCKET|aws CLI not found/);
  });

  it("refuses when AWS_ACCESS_KEY_ID equals CLAWQL_SYNC_ACCESS_KEY_ID", () => {
    const r = run({
      CLAWQL_CELLD_LEASE_BUCKET: "fake-bucket",
      AWS_ACCESS_KEY_ID: "r2keysame",
      AWS_SECRET_ACCESS_KEY: "secret",
      CLAWQL_SYNC_ACCESS_KEY_ID: "r2keysame",
      CLAWQL_SYNC_SECRET_ACCESS_KEY: "secret",
      PATH: process.env.PATH,
    });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /R2 sync/);
  });
});
