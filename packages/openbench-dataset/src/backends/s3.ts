import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DatasetBackend, S3CompatibleConfig } from "./types.js";

export class S3CompatibleBackend implements DatasetBackend {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3CompatibleConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region ?? "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async putObject(key: string, body: string | Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key.replace(/^\//, ""),
        Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
        ContentType: contentType ?? "application/octet-stream",
      })
    );
  }
}

export type ResolveR2ConfigResult =
  | { ok: true; config: S3CompatibleConfig; bucket: string }
  | { ok: false; missing: string[] };

/** Resolve R2/S3 config from ClawQL / OpenBench env aliases. */
export function resolveR2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResolveR2ConfigResult {
  const bucket =
    env.CLAWQL_R2_TRACES_BUCKET?.trim() ||
    env.CLAWQL_OPENBENCH_R2_BUCKET?.trim() ||
    env.CLAWQL_SYNC_BUCKET?.trim() ||
    "";
  const account =
    env.CLAWQL_R2_ACCOUNT_ID?.trim() ||
    env.CLAWQL_CLOUDFLARE_ACCOUNT_ID?.trim() ||
    env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
    "";
  const accessKeyId =
    env.CLAWQL_SYNC_ACCESS_KEY_ID?.trim() ||
    env.R2_ACCESS_KEY_ID?.trim() ||
    env.AWS_ACCESS_KEY_ID?.trim() ||
    "";
  const secretAccessKey =
    env.CLAWQL_SYNC_SECRET_ACCESS_KEY?.trim() ||
    env.R2_SECRET_ACCESS_KEY?.trim() ||
    env.AWS_SECRET_ACCESS_KEY?.trim() ||
    "";

  const missing: string[] = [];
  if (!bucket) missing.push("CLAWQL_R2_TRACES_BUCKET|CLAWQL_OPENBENCH_R2_BUCKET|CLAWQL_SYNC_BUCKET");
  if (!account) missing.push("CLOUDFLARE_ACCOUNT_ID|CLAWQL_R2_ACCOUNT_ID");
  if (!accessKeyId) missing.push("CLAWQL_SYNC_ACCESS_KEY_ID|R2_ACCESS_KEY_ID");
  if (!secretAccessKey) missing.push("CLAWQL_SYNC_SECRET_ACCESS_KEY|R2_SECRET_ACCESS_KEY");
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    bucket,
    config: {
      bucket,
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      accessKeyId,
      secretAccessKey,
      region: env.AWS_DEFAULT_REGION?.trim() || "auto",
    },
  };
}
