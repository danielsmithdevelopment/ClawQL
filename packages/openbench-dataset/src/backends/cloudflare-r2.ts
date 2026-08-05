/**
 * R2 via Cloudflare Account API token (same path as `clawql sync ensure`).
 *
 * Bucket create + object put use Workers R2 Storage Write — no separate
 * R2 S3 access-key secrets required when CLOUDFLARE_API_TOKEN is set.
 */

import type { DatasetBackend } from "./types.js";

export const DEFAULT_OPENBENCH_TRACES_BUCKET = "clawql-openbench-traces";
export const DEFAULT_R2_LOCATION_HINT = "weur";

export type CloudflareR2RestConfig = {
  accountId: string;
  apiToken: string;
  bucket: string;
  fetchFn?: typeof fetch;
};

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const v = env[key]?.trim();
  return v || undefined;
}

export function resolveCloudflareApiToken(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return (
    envTrim(env, "CLAWQL_CLOUDFLARE_API_TOKEN") ??
    envTrim(env, "CLOUDFLARE_API_TOKEN")
  );
}

export function resolveR2AccountId(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    envTrim(env, "CLAWQL_R2_ACCOUNT_ID") ??
    envTrim(env, "CLAWQL_CLOUDFLARE_ACCOUNT_ID") ??
    envTrim(env, "CLOUDFLARE_ACCOUNT_ID")
  );
}

/**
 * Dedicated OpenBench traces bucket. Never falls back to CLAWQL_SYNC_BUCKET
 * (team vault) — avoid mixing inference traces with Memory/.
 */
export function resolveOpenBenchTracesBucket(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    envTrim(env, "CLAWQL_R2_TRACES_BUCKET") ??
    envTrim(env, "CLAWQL_OPENBENCH_R2_BUCKET") ??
    DEFAULT_OPENBENCH_TRACES_BUCKET
  );
}

/** Encode object key path segments; keep `/` literal (Cloudflare R2 REST requirement). */
export function encodeR2ObjectKey(key: string): string {
  return key
    .replace(/^\//, "")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export type EnsureBucketResult = {
  bucket: string;
  created: boolean;
  method: "already-exists" | "cloudflare-api";
};

/**
 * Idempotent R2 bucket ensure via Cloudflare REST (mirrors home-sync ensure).
 */
export async function ensureR2BucketViaCloudflareApi(opts: {
  accountId: string;
  token: string;
  bucket: string;
  locationHint?: string;
  dryRun?: boolean;
  fetchFn?: typeof fetch;
}): Promise<EnsureBucketResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/r2/buckets`;
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    "Content-Type": "application/json",
  };

  const getRes = await fetchFn(`${base}/${encodeURIComponent(opts.bucket)}`, {
    method: "GET",
    headers,
  });
  if (getRes.ok) {
    return { bucket: opts.bucket, created: false, method: "already-exists" };
  }
  if (getRes.status !== 404 && getRes.status !== 400) {
    const body = await getRes.text().catch(() => "");
    throw new Error(
      `Cloudflare R2 get bucket failed (${getRes.status}): ${body.slice(0, 300) || getRes.statusText}`
    );
  }

  if (opts.dryRun) {
    return { bucket: opts.bucket, created: true, method: "cloudflare-api" };
  }

  const payload: Record<string, string> = { name: opts.bucket };
  const hint = opts.locationHint?.trim() || DEFAULT_R2_LOCATION_HINT;
  if (hint) payload.locationHint = hint.toLowerCase();

  const createRes = await fetchFn(base, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (createRes.ok || createRes.status === 409) {
    return {
      bucket: opts.bucket,
      created: createRes.status !== 409,
      method: createRes.status === 409 ? "already-exists" : "cloudflare-api",
    };
  }
  const body = await createRes.text().catch(() => "");
  if (/already exists|10004|conflict/i.test(body)) {
    return { bucket: opts.bucket, created: false, method: "already-exists" };
  }
  throw new Error(
    `Cloudflare R2 create bucket failed (${createRes.status}): ${body.slice(0, 400) || createRes.statusText}`
  );
}

/** Put objects with CLOUDFLARE_API_TOKEN (Workers R2 Storage Write). Max 300 MB/object. */
export class CloudflareR2RestBackend implements DatasetBackend {
  readonly name = "cloudflare-r2";
  private readonly accountId: string;
  private readonly token: string;
  private readonly bucket: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: CloudflareR2RestConfig) {
    this.accountId = config.accountId;
    this.token = config.apiToken;
    this.bucket = config.bucket;
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async putObject(key: string, body: string | Buffer, contentType?: string): Promise<void> {
    const buf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.accountId)}` +
      `/r2/buckets/${encodeURIComponent(this.bucket)}/objects/${encodeR2ObjectKey(key)}`;
    const res = await this.fetchFn(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": contentType ?? "application/octet-stream",
      },
      // Node fetch accepts Uint8Array; avoid relying on Buffer as BodyInit.
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Cloudflare R2 put object failed (${res.status}) key=${key}: ${text.slice(0, 300) || res.statusText}`
      );
    }
  }
}
