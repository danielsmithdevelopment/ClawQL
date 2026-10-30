/**
 * In-memory S3 Object Lock + versioning simulator for unit tests.
 * Models Amazon S3 / MinIO behavior closely enough to prove:
 * - PUT with IfNoneMatch:* fails when a current (non-delete-marker) tip exists
 * - PUT without IfNoneMatch creates a new version; prior locked versions stay
 * - Plain DeleteObject adds a delete marker
 * - DeleteObject(VersionId) of a locked version is refused until retainUntil
 */

import { createHash, randomUUID } from "node:crypto";

export type SimObjectLockMode = "COMPLIANCE" | "GOVERNANCE";

type SimVersion = {
  versionId: string;
  body: Buffer;
  contentType?: string;
  isDeleteMarker?: boolean;
  lockMode?: SimObjectLockMode;
  retainUntil?: Date;
};

type SimBucket = {
  objectLockEnabled: boolean;
  defaultRetention?: { mode: SimObjectLockMode; days: number };
  /** key → versions (oldest first) */
  objects: Map<string, SimVersion[]>;
};

function md5Base64(buf: Buffer): string {
  return createHash("md5").update(buf).digest("base64");
}

function err(name: string, message: string, status: number): Error {
  const e = new Error(message) as Error & {
    name: string;
    Code: string;
    $metadata: { httpStatusCode: number };
  };
  e.name = name;
  e.Code = name;
  e.$metadata = { httpStatusCode: status };
  return e;
}

function cmdName(command: unknown): string {
  const c = command as { constructor?: { name?: string }; input?: unknown };
  return c?.constructor?.name ?? "";
}

function cmdInput(command: unknown): Record<string, unknown> {
  return ((command as { input?: Record<string, unknown> }).input ?? {}) as Record<string, unknown>;
}

function bodyToBuffer(body: unknown): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body ?? ""), "utf8");
}

function currentTip(versions: SimVersion[]): SimVersion | undefined {
  for (let i = versions.length - 1; i >= 0; i--) {
    const v = versions[i]!;
    if (!v.isDeleteMarker) return v;
    // delete marker is latest → no current tip
    return undefined;
  }
  return undefined;
}

function isLocked(v: SimVersion, now: Date): boolean {
  return Boolean(v.lockMode && v.retainUntil && v.retainUntil.getTime() > now.getTime());
}

export class ObjectLockS3Simulator {
  readonly buckets = new Map<string, SimBucket>();
  now: Date = new Date();

  ensureBucket(name: string, opts?: { objectLockEnabled?: boolean }): SimBucket {
    let b = this.buckets.get(name);
    if (!b) {
      b = {
        objectLockEnabled: opts?.objectLockEnabled ?? false,
        objects: new Map(),
      };
      this.buckets.set(name, b);
    }
    if (opts?.objectLockEnabled) b.objectLockEnabled = true;
    return b;
  }

  send = async (command: unknown): Promise<unknown> => {
    const name = cmdName(command);
    const input = cmdInput(command);
    const bucket = String(input.Bucket ?? "");
    const key = String(input.Key ?? "");

    if (name === "GetObjectLockConfigurationCommand") {
      const b = this.buckets.get(bucket);
      if (!b?.objectLockEnabled) {
        throw err("ObjectLockConfigurationNotFoundError", "Object Lock not enabled", 404);
      }
      return {
        ObjectLockConfiguration: {
          ObjectLockEnabled: "Enabled",
          ...(b.defaultRetention
            ? {
                Rule: {
                  DefaultRetention: {
                    Mode: b.defaultRetention.mode,
                    Days: b.defaultRetention.days,
                  },
                },
              }
            : {}),
        },
      };
    }

    if (name === "PutObjectCommand") {
      const b = this.ensureBucket(bucket);
      if (b.objectLockEnabled && input.ObjectLockMode && !input.ContentMD5) {
        throw err("InvalidRequest", "Content-MD5 required for Object Lock", 400);
      }
      const body = bodyToBuffer(input.Body);
      if (input.ContentMD5 && String(input.ContentMD5) !== md5Base64(body)) {
        throw err("BadDigest", "Content-MD5 mismatch", 400);
      }
      const versions = b.objects.get(key) ?? [];
      const tip = currentTip(versions);
      if (input.IfNoneMatch === "*" && tip) {
        throw err("PreconditionFailed", "IfNoneMatch * failed — key exists", 412);
      }
      const versionId = randomUUID().replace(/-/g, "");
      const lockMode = input.ObjectLockMode as SimObjectLockMode | undefined;
      const retainUntil = input.ObjectLockRetainUntilDate
        ? new Date(String(input.ObjectLockRetainUntilDate))
        : undefined;
      if (b.objectLockEnabled && lockMode && !retainUntil) {
        throw err("InvalidRequest", "ObjectLockRetainUntilDate required", 400);
      }
      versions.push({
        versionId,
        body,
        contentType: input.ContentType ? String(input.ContentType) : undefined,
        lockMode,
        retainUntil,
      });
      b.objects.set(key, versions);
      return { VersionId: versionId, ETag: `"${md5Base64(body)}"` };
    }

    if (name === "GetObjectCommand") {
      const b = this.buckets.get(bucket);
      const versions = b?.objects.get(key) ?? [];
      const versionId = input.VersionId ? String(input.VersionId) : undefined;
      let target: SimVersion | undefined;
      if (versionId) {
        target = versions.find((v) => v.versionId === versionId);
      } else {
        // Latest non-delete-marker; if latest is delete marker → NoSuchKey
        const latest = versions[versions.length - 1];
        if (latest?.isDeleteMarker) {
          throw err("NoSuchKey", "The specified key does not exist", 404);
        }
        target = currentTip(versions);
      }
      if (!target || target.isDeleteMarker) {
        throw err("NoSuchKey", "The specified key does not exist", 404);
      }
      return {
        Body: Buffer.from(target.body),
        VersionId: target.versionId,
        ContentType: target.contentType,
      };
    }

    if (name === "ListObjectVersionsCommand") {
      const b = this.buckets.get(bucket);
      const prefix = input.Prefix != null ? String(input.Prefix) : "";
      const Versions: Array<{
        Key: string;
        VersionId: string;
        IsLatest: boolean;
        Size: number;
      }> = [];
      const DeleteMarkers: Array<{ Key: string; VersionId: string; IsLatest: boolean }> = [];
      if (!b) return { Versions, DeleteMarkers };
      for (const [k, vers] of b.objects) {
        if (prefix && !k.startsWith(prefix)) continue;
        for (let i = 0; i < vers.length; i++) {
          const v = vers[i]!;
          const isLatest = i === vers.length - 1;
          if (v.isDeleteMarker) {
            DeleteMarkers.push({ Key: k, VersionId: v.versionId, IsLatest: isLatest });
          } else {
            Versions.push({
              Key: k,
              VersionId: v.versionId,
              IsLatest: isLatest && !v.isDeleteMarker,
              Size: v.body.length,
            });
          }
        }
        // Fix IsLatest among non-delete versions: S3 marks the overall latest
        // version separately; for our probes Key match + VersionId is enough.
        const last = vers[vers.length - 1];
        if (last && !last.isDeleteMarker) {
          for (const row of Versions) {
            if (row.Key === k) row.IsLatest = row.VersionId === last.versionId;
          }
        } else if (last?.isDeleteMarker) {
          for (const row of Versions) {
            if (row.Key === k) row.IsLatest = false;
          }
        }
      }
      return { Versions, DeleteMarkers };
    }

    if (name === "DeleteObjectCommand") {
      const b = this.buckets.get(bucket);
      if (!b) throw err("NoSuchBucket", "bucket", 404);
      const versions = b.objects.get(key) ?? [];
      const versionId = input.VersionId ? String(input.VersionId) : undefined;
      if (versionId) {
        const v = versions.find((x) => x.versionId === versionId);
        if (!v) throw err("NoSuchVersion", "version", 404);
        if (isLocked(v, this.now)) {
          throw err(
            "AccessDenied",
            `Object is locked until ${v.retainUntil?.toISOString()} (${v.lockMode})`,
            403
          );
        }
        b.objects.set(
          key,
          versions.filter((x) => x.versionId !== versionId)
        );
        return { VersionId: versionId };
      }
      // Plain delete → delete marker
      const markerId = randomUUID().replace(/-/g, "");
      versions.push({
        versionId: markerId,
        body: Buffer.alloc(0),
        isDeleteMarker: true,
      });
      b.objects.set(key, versions);
      return { VersionId: markerId, DeleteMarker: true };
    }

    if (name === "GetObjectRetentionCommand") {
      const b = this.buckets.get(bucket);
      const versions = b?.objects.get(key) ?? [];
      const versionId = input.VersionId ? String(input.VersionId) : undefined;
      const v = versionId ? versions.find((x) => x.versionId === versionId) : currentTip(versions);
      if (!v?.lockMode || !v.retainUntil) {
        throw err("NoSuchObjectLockConfiguration", "no retention", 404);
      }
      return {
        Retention: {
          Mode: v.lockMode,
          RetainUntilDate: v.retainUntil,
        },
      };
    }

    throw new Error(`ObjectLockS3Simulator: unhandled command ${name}`);
  };
}
