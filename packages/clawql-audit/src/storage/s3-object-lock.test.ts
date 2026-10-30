import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { WORM_GENESIS_PREV_HASH, type WORMEntry } from "../entry.js";
import { ObjectLockS3Simulator } from "./s3-object-lock-sim.js";
import { S3Backend, contentMd5Base64, entryObjectKey, objectLockRetainUntilDate } from "./s3.js";

function sampleEntry(id = "id-1", chainIndex = 0): WORMEntry {
  return {
    id,
    hash: "ab".repeat(32),
    prevHash: WORM_GENESIS_PREV_HASH,
    chainIndex,
    writtenAt: "2026-08-01T00:00:00.000Z",
    backendAcks: [],
    type: "SESSION_START",
    timestamp: "2026-08-01T00:00:00.000Z",
    sessionId: "s",
  };
}

describe("S3Backend Object Lock (simulator)", () => {
  it("writes Content-MD5 + ObjectLock COMPLIANCE + IfNoneMatch on PutObject", async () => {
    const puts: Record<string, unknown>[] = [];
    const backend = new S3Backend({
      bucket: "worm",
      objectLock: { mode: "COMPLIANCE", retainDays: 1 },
      client: {
        send: async (cmd) => {
          puts.push((cmd as { input: Record<string, unknown> }).input);
          return { VersionId: "v1" };
        },
      },
    });
    const entry = sampleEntry();
    await Effect.runPromise(backend.write(entry));
    expect(puts).toHaveLength(1);
    const put = puts[0]!;
    expect(put.IfNoneMatch).toBe("*");
    expect(put.ObjectLockMode).toBe("COMPLIANCE");
    expect(put.ObjectLockRetainUntilDate).toBeInstanceOf(Date);
    expect(put.ContentMD5).toBe(contentMd5Base64(JSON.stringify(entry)));
    expect(put.Key).toBe(entryObjectKey("worm/", entry));
  });

  it("verifyBucketObjectLockEnabled requires Enabled configuration", async () => {
    const sim = new ObjectLockS3Simulator();
    sim.ensureBucket("plain");
    const unlocked = new S3Backend({ bucket: "plain", client: sim });
    await expect(Effect.runPromise(unlocked.verifyBucketObjectLockEnabled())).rejects.toBeTruthy();

    sim.ensureBucket("locked", { objectLockEnabled: true });
    const locked = new S3Backend({
      bucket: "locked",
      objectLock: { mode: "GOVERNANCE", retainDays: 1 },
      client: sim,
    });
    const cfg = await Effect.runPromise(locked.verifyBucketObjectLockEnabled());
    expect(cfg.objectLockEnabled).toBe(true);
  });

  it("protects locked versions: body intact, delete marker on plain delete, version delete refused", async () => {
    const sim = new ObjectLockS3Simulator();
    sim.ensureBucket("worm", { objectLockEnabled: true });
    const backend = new S3Backend({
      bucket: "worm",
      objectLock: { mode: "GOVERNANCE", retainDays: 1 },
      client: sim,
    });
    const entry = sampleEntry("lock-1", 3);
    await Effect.runPromise(backend.write(entry));

    const proof = await Effect.runPromise(backend.assertObjectLockProtectsVersions(entry));
    expect(proof.originalBodyUnchangedAfterOverwriteAttempt).toBe(true);
    expect(proof.versionDeleteRefused).toBe(true);
    expect(proof.plainDeleteCreatedDeleteMarker).toBe(true);
    expect(proof.ifNoneMatchBlockedDuplicateKey).toBe(true);
    expect(proof.mode).toBe("GOVERNANCE");
    expect(proof.originalVersionId.length).toBeGreaterThan(8);
  });

  it("COMPLIANCE mode also refuses version delete (short 1-day retention)", async () => {
    const sim = new ObjectLockS3Simulator();
    sim.ensureBucket("worm-compliance", { objectLockEnabled: true });
    const backend = new S3Backend({
      bucket: "worm-compliance",
      objectLock: { mode: "COMPLIANCE", retainDays: 1 },
      client: sim,
    });
    const entry = sampleEntry("c-1", 0);
    await Effect.runPromise(backend.write(entry));
    const proof = await Effect.runPromise(backend.assertObjectLockProtectsVersions(entry));
    expect(proof.mode).toBe("COMPLIANCE");
    expect(proof.versionDeleteRefused).toBe(true);
    expect(proof.originalBodyUnchangedAfterOverwriteAttempt).toBe(true);
  });

  it("objectLockRetainUntilDate uses at least 1 day", () => {
    const now = new Date("2026-10-30T00:00:00.000Z");
    expect(objectLockRetainUntilDate(0, now).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(objectLockRetainUntilDate(1, now).toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("rejects retainDays < 1 at construction", () => {
    expect(
      () =>
        new S3Backend({
          bucket: "b",
          objectLock: { mode: "COMPLIANCE", retainDays: 0 },
        })
    ).toThrow(/retainDays/);
  });
});
