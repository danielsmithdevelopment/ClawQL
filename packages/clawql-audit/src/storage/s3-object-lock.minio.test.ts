/**
 * Live MinIO Object Lock integration.
 *
 * Skips unless CLAWQL_WORM_MINIO_ENDPOINT is set (CI service or local compose).
 *
 *   docker compose -f packages/clawql-audit/docker-compose.minio-object-lock.yml up -d
 *   export CLAWQL_WORM_MINIO_ENDPOINT=http://127.0.0.1:9000
 *   export CLAWQL_WORM_MINIO_ACCESS_KEY=minioadmin
 *   export CLAWQL_WORM_MINIO_SECRET_KEY=minioadmin
 *   npm test -w clawql-audit -- src/storage/s3-object-lock.minio.test.ts
 *
 * Governance: used for the full protection probe (cleanup possible with bypass).
 * Compliance: dedicated bucket, 1-day retention — only asserts version-delete refusal
 * (objects cannot be removed until retention expires; discard the bucket).
 */

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectLockConfigurationCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Effect } from "effect";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { WORM_GENESIS_PREV_HASH, type WORMEntry } from "../entry.js";
import { S3Backend } from "./s3.js";

const endpoint = process.env.CLAWQL_WORM_MINIO_ENDPOINT?.trim();
const accessKeyId = process.env.CLAWQL_WORM_MINIO_ACCESS_KEY?.trim() || "minioadmin";
const secretAccessKey = process.env.CLAWQL_WORM_MINIO_SECRET_KEY?.trim() || "minioadmin";

const describeMinio = endpoint ? describe : describe.skip;

async function createLockBucket(
  client: S3Client,
  bucket: string,
  mode: "GOVERNANCE" | "COMPLIANCE"
): Promise<void> {
  await client.send(
    new CreateBucketCommand({
      Bucket: bucket,
      ObjectLockEnabledForBucket: true,
    })
  );
  await client.send(
    new PutObjectLockConfigurationCommand({
      Bucket: bucket,
      ObjectLockConfiguration: {
        ObjectLockEnabled: "Enabled",
        Rule: {
          DefaultRetention: {
            Mode: mode,
            Days: 1,
          },
        },
      },
    })
  );
}

function entry(id: string): WORMEntry {
  return {
    id,
    hash: "cd".repeat(32),
    prevHash: WORM_GENESIS_PREV_HASH,
    chainIndex: 0,
    writtenAt: new Date().toISOString(),
    backendAcks: [],
    type: "TOOL_CALL_RESULT",
    timestamp: new Date().toISOString(),
    sessionId: "minio-object-lock",
    metadata: { note: "no PHI — hash/refs only in production healthcare trails" },
  };
}

describeMinio("S3Backend Object Lock (MinIO)", () => {
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_SUPPORTED",
  });
  const buckets: string[] = [];

  afterAll(async () => {
    // Best-effort: governance objects may be bypass-deleted; compliance bucket left for discard.
    for (const bucket of buckets) {
      if (bucket.includes("compliance")) continue;
      try {
        // Leave non-compliance buckets; CI ephemeral MinIO volume is discarded with the job.
        void bucket;
      } catch {
        /* ignore */
      }
    }
  });

  it("GOVERNANCE: original version intact; version delete refused; IfNoneMatch create-once", async () => {
    const bucket = `worm-gov-${randomUUID().slice(0, 8)}`;
    buckets.push(bucket);
    await createLockBucket(client, bucket, "GOVERNANCE");

    const backend = new S3Backend({
      bucket,
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      objectLock: { mode: "GOVERNANCE", retainDays: 1 },
      prefix: "audit/",
    });

    const cfg = await Effect.runPromise(backend.verifyBucketObjectLockEnabled());
    expect(cfg.objectLockEnabled).toBe(true);

    const e = entry(`gov-${randomUUID().slice(0, 8)}`);
    await Effect.runPromise(backend.write(e));
    const proof = await Effect.runPromise(backend.assertObjectLockProtectsVersions(e));
    expect(proof.versionDeleteRefused).toBe(true);
    expect(proof.originalBodyUnchangedAfterOverwriteAttempt).toBe(true);
    expect(proof.plainDeleteCreatedDeleteMarker).toBe(true);

    // Cleanup locked version with governance bypass (MinIO / S3).
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: `audit/${"0".padStart(12, "0")}/${e.id}.json`,
          VersionId: proof.originalVersionId,
          BypassGovernanceRetention: true,
        })
      );
    } catch {
      /* volume discarded in CI */
    }
  }, 60_000);

  it("COMPLIANCE (1-day): version delete refused on dedicated bucket", async () => {
    const bucket = `worm-compliance-${randomUUID().slice(0, 8)}`;
    buckets.push(bucket);
    await createLockBucket(client, bucket, "COMPLIANCE");

    const backend = new S3Backend({
      bucket,
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      objectLock: { mode: "COMPLIANCE", retainDays: 1 },
      prefix: "audit/",
    });

    await Effect.runPromise(backend.verifyBucketObjectLockEnabled());
    const e = entry(`comp-${randomUUID().slice(0, 8)}`);
    await Effect.runPromise(backend.write(e));
    const proof = await Effect.runPromise(backend.assertObjectLockProtectsVersions(e));
    expect(proof.mode).toBe("COMPLIANCE");
    expect(proof.versionDeleteRefused).toBe(true);
    expect(proof.originalBodyUnchangedAfterOverwriteAttempt).toBe(true);
    // Do not attempt BypassGovernanceRetention — compliance cannot be bypassed.
  }, 60_000);
});
