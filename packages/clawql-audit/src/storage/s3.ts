/**
 * S3 / Cloudflare R2 remote backend — write-primary; queries are not supported.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import type { StorageBackend } from "./types.js";

export type S3BackendConfig = {
  bucket: string;
  endpoint?: string;
  region?: string;
  prefix?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  /** Inject for tests. */
  client?: {
    send: (command: PutObjectCommand) => Promise<unknown>;
  };
};

type S3Sender = {
  send: (command: PutObjectCommand) => Promise<unknown>;
};

export class S3Backend implements StorageBackend {
  private readonly client: S3Sender;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: S3BackendConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ?? "worm/";
    this.client = (config.client ??
      new S3Client({
        endpoint: config.endpoint,
        credentials: config.credentials,
        region: config.region ?? "auto",
      })) as S3Sender;
  }

  write = (entry: WORMEntry): Effect.Effect<void, AuditError> =>
    Effect.tryPromise({
      try: async () => {
        const key = `${this.prefix}${String(entry.chainIndex).padStart(12, "0")}/${entry.id}.json`;
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: JSON.stringify(entry),
            ContentType: "application/json",
            IfNoneMatch: "*",
          })
        );
      },
      catch: (cause) => new AuditError({ reason: "S3 write failed", cause }),
    });

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
