import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { DatasetBackend, S3CompatibleConfig } from "./types.js";
import {
  CloudflareR2RestBackend,
  ensureR2BucketViaCloudflareApi,
  resolveCloudflareApiToken,
  resolveOpenBenchTracesBucket,
  resolveR2AccountId,
  type EnsureBucketResult,
} from "./cloudflare-r2.js";

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

/** Resolve R2/S3 config from ClawQL / OpenBench env aliases (S3 keys path). */
export function resolveR2ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResolveR2ConfigResult {
  const bucket = resolveOpenBenchTracesBucket(env);
  const account = resolveR2AccountId(env) ?? "";
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

export type ResolveDurableBackendResult =
  | {
      ok: true;
      backend: DatasetBackend;
      bucket: string;
      transport: "s3" | "cloudflare-api";
      ensure?: EnsureBucketResult;
    }
  | { ok: false; missing: string[] };

export type ResolveDurableBackendOptions = {
  env?: NodeJS.ProcessEnv;
  fetchFn?: typeof fetch;
  /** Skip bucket ensure (tests). Default: ensure when CF token present. */
  skipEnsure?: boolean;
};

/**
 * Prefer existing R2 S3 keys when set; otherwise Cloudflare API token alone
 * (ensure bucket + REST put) — same secrets path as `clawql sync ensure`.
 */
export async function resolveDurableBackendFromEnv(
  opts: ResolveDurableBackendOptions = {}
): Promise<ResolveDurableBackendResult> {
  const env = opts.env ?? process.env;
  const bucket = resolveOpenBenchTracesBucket(env);
  const account = resolveR2AccountId(env);
  const token = resolveCloudflareApiToken(env);
  const s3 = resolveR2ConfigFromEnv(env);

  if (s3.ok) {
    let ensure: EnsureBucketResult | undefined;
    if (!opts.skipEnsure && token && account) {
      ensure = await ensureR2BucketViaCloudflareApi({
        accountId: account,
        token,
        bucket,
        fetchFn: opts.fetchFn,
      });
    }
    return {
      ok: true,
      backend: new S3CompatibleBackend(s3.config),
      bucket,
      transport: "s3",
      ensure,
    };
  }

  if (token && account) {
    let ensure: EnsureBucketResult | undefined;
    if (!opts.skipEnsure) {
      ensure = await ensureR2BucketViaCloudflareApi({
        accountId: account,
        token,
        bucket,
        fetchFn: opts.fetchFn,
      });
    }
    return {
      ok: true,
      backend: new CloudflareR2RestBackend({
        accountId: account,
        apiToken: token,
        bucket,
        fetchFn: opts.fetchFn,
      }),
      bucket,
      transport: "cloudflare-api",
      ensure,
    };
  }

  const missing = new Set<string>();
  if (!account) missing.add("CLOUDFLARE_ACCOUNT_ID|CLAWQL_R2_ACCOUNT_ID");
  if (!token) {
    missing.add("CLOUDFLARE_API_TOKEN|CLAWQL_CLOUDFLARE_API_TOKEN");
    for (const m of s3.ok ? [] : s3.missing) {
      if (!m.includes("ACCOUNT")) missing.add(m);
    }
  }
  return { ok: false, missing: [...missing] };
}
