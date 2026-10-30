/**
 * Live S3 Object Lock integration (LocalStack in CI; MinIO locally if available).
 *
 * Skips unless CLAWQL_WORM_S3_IT_ENDPOINT (or legacy CLAWQL_WORM_MINIO_ENDPOINT) is set.
 *
 *   docker compose -f packages/clawql-audit/docker-compose.minio-object-lock.yml up -d
 *   export CLAWQL_WORM_S3_IT_ENDPOINT=http://127.0.0.1:4566
 *   export CLAWQL_WORM_S3_IT_ACCESS_KEY=test
 *   export CLAWQL_WORM_S3_IT_SECRET_KEY=test
 *   npm test -w clawql-audit -- src/storage/s3-object-lock.integration.test.ts
 *
 * Governance: full protection probe (cleanup with BypassGovernanceRetention when supported).
 * Compliance: dedicated bucket, 1-day retention — asserts version-delete refusal only
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

const endpoint =
  process.env.CLAWQL_WORM_S3_IT_ENDPOINT?.trim() || process.env.CLAWQL_WORM_MINIO_ENDPOINT?.trim();
const accessKeyId =
  process.env.CLAWQL_WORM_S3_IT_ACCESS_KEY?.trim() ||
  process.env.CLAWQL_WORM_MINIO_ACCESS_KEY?.trim() ||
  "test";
const secretAccessKey =
  process.env.CLAWQL_WORM_S3_IT_SECRET_KEY?.trim() ||
  process.env.CLAWQL_WORM_MINIO_SECRET_KEY?.trim() ||
  "test";

const describeIt = endpoint ? describe : describe.skip;

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
    sessionId: "s3-object-lock-it",
    metadata: { note: "no PHI — hash/refs only in production healthcare trails" },
  };
}

describeIt("S3Backend Object Lock (integration)", () => {
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_SUPPORTED",
  });
  const buckets: string[] = [];

  afterAll(async () => {
    for (const bucket of buckets) {
      if (bucket.includes("compliance")) continue;
      try {
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
      /* container discarded with the job */
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
  }, 60_000);
});
