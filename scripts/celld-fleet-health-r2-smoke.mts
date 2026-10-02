#!/usr/bin/env npx tsx
/**
 * Live S3-compatible ListObjects → celld fleet-health evaluator smoke.
 *
 * Uses CLAWQL_SYNC_* + CLAWQL_R2_ACCOUNT_ID (Cloudflare R2). Demonstrates the
 * §8 fleet-health lease ingress path against a real object store.
 *
 * Honesty: this is NOT AWS EKS / Cost Explorer §13.5. Keys under the sync
 * prefix are vault objects, not celld leases — we synthesize lease-shaped
 * records from object metadata only for wiring smoke, then evaluate.
 *
 * Usage:
 *   npx tsx scripts/celld-fleet-health-r2-smoke.mts
 */

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { writeFileSync } from "node:fs";
import {
  evaluateCelldFleetHealth,
  type CelldLeaseRecord,
} from "../packages/clawql-k8s-operator/src/watches/celld-fleet-health.ts";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`missing ${name}`);
  return v;
}

const accountId = requireEnv("CLAWQL_R2_ACCOUNT_ID");
const accessKeyId = requireEnv("CLAWQL_SYNC_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("CLAWQL_SYNC_SECRET_ACCESS_KEY");
const bucket = process.env.CLAWQL_SYNC_BUCKET?.trim() || "clawql-team-vault";
const prefix = process.env.CLAWQL_SYNC_PREFIX?.trim() || "teams/shared/";
const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

const client = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

const listed = await client.send(
  new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 20 })
);

const contents = listed.Contents ?? [];
const now = Date.now();

// Synthesize lease-shaped records from live object LastModified timestamps.
// Real celld leases would be JSON under a leases/ prefix — this proves List→evaluate wiring.
const leases: CelldLeaseRecord[] = contents
  .filter((o) => o.Key && o.LastModified)
  .slice(0, 5)
  .map((o, i) => ({
    nodeId: `r2-obj-${i}`,
    renewedAtMs: o.LastModified!.getTime(),
    ttlMs: 365 * 24 * 3600 * 1000, // vault objects are long-lived; avoid false stale noise
  }));

const report = await Effect.runPromise(
  evaluateCelldFleetHealth({
    leases,
    expectedNodeIds: leases.map((l) => l.nodeId),
    nowMs: now,
    sourceNote:
      "Leases synthesized from live R2 ListObjects LastModified (CLAWQL_SYNC_*). Not EKS celld leases; not §13.5 Cost Explorer.",
  })
);

const out = {
  status: "live-r2-list-fleet-health-smoke",
  generatedAt: new Date(now).toISOString(),
  store: {
    provider: "r2",
    bucket,
    prefix,
    listedKeyCount: contents.length,
    isTruncated: !!listed.IsTruncated,
  },
  fleetHealth: {
    ok: report.ok,
    findingCount: report.findings.length,
    watchEventCount: report.watchEvents.length,
    note: report.note,
  },
  honesty:
    "Live R2 ListObjects + evaluateCelldFleetHealth wiring only. Not AWS Cost Explorer §13.5; not EKS celld leases.",
};

const path = process.env.OUT || "/opt/cursor/artifacts/live-r2-fleet-health-smoke.json";
writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
console.log(`wrote ${path}`);
