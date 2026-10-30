/**
 * S3 remote backend — write-primary; queries are not supported.
 *
 * Default path is create-once (`IfNoneMatch: *`) + hash chain elsewhere =
 * tamper-evident, not storage WORM.
 *
 * Storage-level WORM requires a versioned bucket with **S3 Object Lock**.
 * Under Object Lock, a PUT to the same key creates a *new version*; the locked
 * version cannot be deleted or altered until retention expires. Plain
 * DeleteObject adds a delete marker; DeleteObject(VersionId=locked) is refused.
 *
 * Provider notes: Amazon S3 and MinIO support Object Lock. Cloudflare R2 does
 * **not** implement the S3 Object Lock API (use R2 bucket locks separately, or
 * set `CLAWQL_WORM_S3_OBJECT_LOCK=0`).
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import type { StorageBackend } from "./types.js";

export type S3ObjectLockMode = "COMPLIANCE" | "GOVERNANCE";

export type S3ObjectLockConfig = {
  mode: S3ObjectLockMode;
  /** Retention days from each PutObject write time (S3 minimum is 1 day). */
  retainDays: number;
};

export type S3BackendConfig = {
  bucket: string;
  endpoint?: string;
  region?: string;
  prefix?: string;
  forcePathStyle?: boolean;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /**
   * When set, every PutObject includes Object Lock retention + Content-MD5.
   * Bucket must be created with Object Lock enabled (implies versioning).
   */
  objectLock?: S3ObjectLockConfig;
  /** Inject for tests (versioning + Object Lock simulator or AWS SDK client). */
  client?: {
    send: (command: unknown) => Promise<unknown>;
  };
};

type S3Sender = {
  send: (command: unknown) => Promise<unknown>;
};

export type ObjectLockProtectionResult = {
  originalVersionId: string;
  originalBodySha256: string;
  originalBodyUnchangedAfterOverwriteAttempt: true;
  ifNoneMatchBlockedDuplicateKey: boolean;
  plainDeleteCreatedDeleteMarker: boolean;
  versionDeleteRefused: true;
  mode: S3ObjectLockMode;
};

export function objectLockRetainUntilDate(retainDays: number, now: Date = new Date()): Date {
  const days = Math.max(1, Math.floor(retainDays));
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function entryObjectKey(
  prefix: string,
  entry: Pick<WORMEntry, "chainIndex" | "id">
): string {
  return `${prefix}${String(entry.chainIndex).padStart(12, "0")}/${entry.id}.json`;
}

export function contentMd5Base64(body: Buffer | string): string {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return createHash("md5").update(buf).digest("base64");
}

export function sha256HexOf(body: Buffer | string): string {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return createHash("sha256").update(buf).digest("hex");
}

function isPreconditionFailed(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const code = `${e?.name ?? ""} ${e?.Code ?? ""}`;
  const status = e?.$metadata?.httpStatusCode;
  return status === 412 || /PreconditionFailed|412/.test(code);
}

function isObjectLockDeleteRefused(err: unknown): boolean {
  const e = err as {
    name?: string;
    Code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const blob = `${e?.name ?? ""} ${e?.Code ?? ""} ${e?.message ?? ""}`;
  const status = e?.$metadata?.httpStatusCode;
  if (status === 403 || status === 405 || status === 409) return true;
  return /AccessDenied|Access Denied|InvalidRequest|ObjectLocked|WORM|retention|Compliance|Governance/i.test(
    blob
  );
}

async function readBodyString(body: unknown): Promise<string> {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  // AWS SDK v3 may return a Readable / IncomingMessage
  const stream = body as AsyncIterable<Uint8Array> & {
    transformToString?: () => Promise<string>;
  };
  if (typeof stream.transformToString === "function") {
    return stream.transformToString();
  }
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class S3Backend implements StorageBackend {
  private readonly client: S3Sender;
  private readonly bucket: string;
  private readonly prefix: string;
  readonly objectLock: S3ObjectLockConfig | undefined;

  constructor(config: S3BackendConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? "worm/";
    this.objectLock = config.objectLock;
    if (config.objectLock && config.objectLock.retainDays < 1) {
      throw new Error("S3 Object Lock retainDays must be >= 1");
    }
    this.client = (config.client ??
      new S3Client({
        endpoint: config.endpoint,
        credentials: config.credentials,
        region: config.region ?? "auto",
        forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
        requestChecksumCalculation: "WHEN_SUPPORTED",
      })) as S3Sender;
  }

  /** True when Object Lock retention headers will be sent on every write. */
  get hasObjectLockWorm(): boolean {
    return this.objectLock !== undefined && this.objectLock.retainDays >= 1;
  }

  write = (entry: WORMEntry): Effect.Effect<void, AuditError> =>
    Effect.tryPromise({
      try: async () => {
        const key = entryObjectKey(this.prefix, entry);
        const body = JSON.stringify(entry);
        const input: PutObjectCommandInput = {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
          // Create-once at the key: blocks silent overwrite of the current tip
          // when the provider honors conditional puts. Object Lock still protects
          // prior versions if a later put succeeds under versioning.
          IfNoneMatch: "*",
          // Object Lock buckets require Content-MD5 (or SDK checksum).
          ContentMD5: contentMd5Base64(body),
        };
        if (this.objectLock) {
          input.ObjectLockMode = this.objectLock.mode;
          input.ObjectLockRetainUntilDate = objectLockRetainUntilDate(this.objectLock.retainDays);
        }
        await this.client.send(new PutObjectCommand(input));
      },
      catch: (cause) => new AuditError({ reason: "S3 write failed", cause }),
    });

  /**
   * Confirm the bucket has Object Lock enabled (versioning implied).
   * Call at boot when claiming storage WORM.
   */
  verifyBucketObjectLockEnabled = (): Effect.Effect<
    { objectLockEnabled: true; defaultMode?: string; defaultDays?: number },
    AuditError
  > =>
    Effect.tryPromise({
      try: async () => {
        const out = (await this.client.send(
          new GetObjectLockConfigurationCommand({ Bucket: this.bucket })
        )) as {
          ObjectLockConfiguration?: {
            ObjectLockEnabled?: string;
            Rule?: { DefaultRetention?: { Mode?: string; Days?: number; Years?: number } };
          };
        };
        const enabled = out.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
        if (!enabled) {
          throw new Error(
            `Bucket ${this.bucket} does not have Object Lock enabled — not storage WORM`
          );
        }
        const def = out.ObjectLockConfiguration?.Rule?.DefaultRetention;
        return {
          objectLockEnabled: true as const,
          defaultMode: def?.Mode,
          defaultDays: def?.Days ?? (def?.Years !== undefined ? def.Years * 365 : undefined),
        };
      },
      catch: (cause) =>
        new AuditError({
          reason: `S3 Object Lock configuration check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    });

  /**
   * Prove Object Lock semantics for a key that was just written:
   * 1. Original version body remains unchanged after an overwrite-style PUT
   * 2. IfNoneMatch:* on the same key is refused (create-once)
   * 3. Plain DeleteObject yields a delete marker; locked version still readable
   * 4. DeleteObject(VersionId=locked) is refused
   */
  assertObjectLockProtectsVersions = (
    entry: Pick<WORMEntry, "chainIndex" | "id">
  ): Effect.Effect<ObjectLockProtectionResult, AuditError> => {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        if (!self.objectLock) {
          throw new Error("assertObjectLockProtectsVersions requires objectLock config");
        }
        const lock = self.objectLock;
        const key = entryObjectKey(self.prefix, entry);

        const listed = (await self.client.send(
          new ListObjectVersionsCommand({ Bucket: self.bucket, Prefix: key })
        )) as {
          Versions?: Array<{ Key?: string; VersionId?: string; IsLatest?: boolean }>;
        };
        const versions = (listed.Versions ?? []).filter((v) => v.Key === key && v.VersionId);
        if (versions.length < 1) {
          throw new Error(
            `No object versions for s3://${self.bucket}/${key} — Object Lock requires versioning`
          );
        }
        const original = versions.find((v) => v.IsLatest) ?? versions[0]!;
        const originalVersionId = original.VersionId!;

        const originalGot = (await self.client.send(
          new GetObjectCommand({
            Bucket: self.bucket,
            Key: key,
            VersionId: originalVersionId,
          })
        )) as { Body?: unknown };
        const originalBody = await readBodyString(originalGot.Body);
        const originalBodySha256 = sha256HexOf(originalBody);

        // Overwrite-style PUT (no IfNoneMatch): typically creates a new version.
        const tamper = JSON.stringify({ tamper: true, at: new Date().toISOString() });
        try {
          await self.client.send(
            new PutObjectCommand({
              Bucket: self.bucket,
              Key: key,
              Body: tamper,
              ContentType: "application/json",
              ContentMD5: contentMd5Base64(tamper),
              ObjectLockMode: lock.mode,
              ObjectLockRetainUntilDate: objectLockRetainUntilDate(lock.retainDays),
            })
          );
        } catch (err) {
          if (!isObjectLockDeleteRefused(err) && !isPreconditionFailed(err)) throw err;
        }

        const afterGot = (await self.client.send(
          new GetObjectCommand({
            Bucket: self.bucket,
            Key: key,
            VersionId: originalVersionId,
          })
        )) as { Body?: unknown };
        const bodyAfter = await readBodyString(afterGot.Body);
        if (sha256HexOf(bodyAfter) !== originalBodySha256) {
          throw new Error(
            `Locked version ${originalVersionId} body changed after overwrite attempt`
          );
        }

        let ifNoneMatchBlockedDuplicateKey = false;
        const again = JSON.stringify({ again: true });
        try {
          await self.client.send(
            new PutObjectCommand({
              Bucket: self.bucket,
              Key: key,
              Body: again,
              ContentType: "application/json",
              ContentMD5: contentMd5Base64(again),
              IfNoneMatch: "*",
              ObjectLockMode: lock.mode,
              ObjectLockRetainUntilDate: objectLockRetainUntilDate(lock.retainDays),
            })
          );
        } catch (err) {
          ifNoneMatchBlockedDuplicateKey =
            isPreconditionFailed(err) || isObjectLockDeleteRefused(err);
          if (!ifNoneMatchBlockedDuplicateKey) throw err;
        }

        await self.client.send(
          new DeleteObjectCommand({
            Bucket: self.bucket,
            Key: key,
          })
        );
        const afterDelete = (await self.client.send(
          new ListObjectVersionsCommand({ Bucket: self.bucket, Prefix: key })
        )) as {
          DeleteMarkers?: Array<{ Key?: string; VersionId?: string }>;
        };
        const markers = (afterDelete.DeleteMarkers ?? []).filter((d) => d.Key === key);
        const stillGot = (await self.client.send(
          new GetObjectCommand({
            Bucket: self.bucket,
            Key: key,
            VersionId: originalVersionId,
          })
        )) as { Body?: unknown };
        const still = await readBodyString(stillGot.Body);
        if (sha256HexOf(still) !== originalBodySha256) {
          throw new Error("original version body changed after plain delete");
        }
        const plainDeleteCreatedDeleteMarker = markers.length >= 1;

        let versionDeleteRefused = false;
        try {
          await self.client.send(
            new DeleteObjectCommand({
              Bucket: self.bucket,
              Key: key,
              VersionId: originalVersionId,
            })
          );
        } catch (err) {
          versionDeleteRefused = isObjectLockDeleteRefused(err);
          if (!versionDeleteRefused) throw err;
        }
        if (!versionDeleteRefused) {
          throw new Error(
            `Object Lock did not refuse DeleteObject(VersionId=${originalVersionId})`
          );
        }

        return {
          originalVersionId,
          originalBodySha256,
          originalBodyUnchangedAfterOverwriteAttempt: true as const,
          ifNoneMatchBlockedDuplicateKey,
          plainDeleteCreatedDeleteMarker,
          versionDeleteRefused: true as const,
          mode: lock.mode,
        };
      },
      catch: (cause) =>
        new AuditError({
          reason: `Object Lock protection probe failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        }),
    });
  };

  query = (_filter: WORMFilter): Effect.Effect<WORMEntry[], AuditError> =>
    Effect.fail(
      new AuditError({
        reason: "S3 backend does not support queries — use local backend",
      })
    );

  all = (): Effect.Effect<WORMEntry[], AuditError> =>
    Effect.fail(
      new AuditError({
        reason: "S3 backend does not support all() — use local backend",
      })
    );

  latestEntry = (): Effect.Effect<WORMEntry | null, AuditError> =>
    Effect.fail(
      new AuditError({
        reason: "S3 backend does not support latestEntry — use local backend",
      })
    );
}
