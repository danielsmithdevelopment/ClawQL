/**
 * Fail-closed checks for run-burst-watch-from-s3-leases.sh (no live AWS).
 * Run: node --test scripts/run-burst-watch-from-s3-leases.test.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(DIR, "run-burst-watch-from-s3-leases.sh");

describe("run-burst-watch-from-s3-leases fail-closed", () => {
  it("exits non-zero without CLAWQL_CELLD_LEASE_BUCKET (via fetch)", () => {
    const r = spawnSync("bash", [SCRIPT, "/tmp/clawql-leases-no-bucket.json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWQL_CELLD_LEASE_BUCKET: "",
        // Avoid R2 collision short-circuit so missing-bucket is exercised
        AWS_ACCESS_KEY_ID: "AKIA_TEST_NOT_SYNC",
        CLAWQL_SYNC_ACCESS_KEY_ID: "CLAWQL_SYNC_OTHER",
      },
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /CLAWQL_CELLD_LEASE_BUCKET|set CLAWQL_CELLD_LEASE_BUCKET/i);
  });

  it("refuses when AWS_ACCESS_KEY_ID equals CLAWQL_SYNC_ACCESS_KEY_ID", () => {
    const r = spawnSync("bash", [SCRIPT, "/tmp/clawql-leases-r2.json"], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAWQL_CELLD_LEASE_BUCKET: "some-bucket",
        AWS_ACCESS_KEY_ID: "SAME_KEY",
        CLAWQL_SYNC_ACCESS_KEY_ID: "SAME_KEY",
      },
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /R2 sync|CLAWQL_SYNC/i);
  });
});
