/**
 * Idempotent team-vault bucket ensure for clawql sync.
 *
 * R2: HeadBucket / CreateBucket via S3 API when keys allow; else Cloudflare
 * REST API (`CLOUDFLARE_API_TOKEN`) with Workers R2 Storage Write.
 * S3: HeadBucket / CreateBucket via AWS SDK when IAM allows CreateBucket.
 * GCS: not auto-created (HMAC keys typically cannot create buckets).
 */

import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  type BucketLocationConstraint,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { readLocalProvidersVault } from "../provider-vault/local-store.js";
import { getLocalProvidersVaultPath } from "../onboarding/paths.js";
import {
  parseSyncProvider,
  resolveHomeSyncConfig,
  resolveSyncCredentials,
  resolveSyncEndpoint,
  writeSyncConfigFile,
  readSyncConfigFile,
} from "./config.js";
import { getSyncConfigPath } from "./paths.js";
import { syncProviderProfile } from "./providers.js";
import type { HomeSyncConfigFile, SyncProvider } from "./types.js";

export const DEFAULT_SYNC_BUCKET = "clawql-team-vault";
export const DEFAULT_SYNC_PREFIX = "teams/shared/";
export const DEFAULT_R2_LOCATION_HINT = "weur";

export type EnsureBucketMethod = "already-exists" | "s3-api" | "cloudflare-api" | "config-only";

export type EnsureBucketResult = {
  provider: SyncProvider;
  bucket: string;
  prefix: string;
  created: boolean;
  method: EnsureBucketMethod;
  dryRun: boolean;
  configPath: string;
};

export type EnsureBucketOptions = {
  home?: string;
  provider?: SyncProvider;
  bucket?: string;
  prefix?: string;
  /** R2 locationHint (e.g. weur). Ignored for S3 except via region. */
  location?: string;
  dryRun?: boolean;
  /** Skip writing sync.json (tests / probe). */
  skipWriteConfig?: boolean;
  fetchFn?: typeof fetch;
  createS3Client?: (config: S3ClientConfig) => {
    send: (command: unknown) => Promise<unknown>;
  };
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

function normalizeBucketName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function defaultEnsureBucketName(provider: SyncProvider): string {
  const fromEnv = envTrim("CLAWQL_SYNC_BUCKET");
  if (fromEnv) return normalizeBucketName(fromEnv);
  if (provider === "s3") return DEFAULT_SYNC_BUCKET;
  return DEFAULT_SYNC_BUCKET;
}

export function defaultEnsurePrefix(): string {
  return envTrim("CLAWQL_SYNC_PREFIX") ?? DEFAULT_SYNC_PREFIX;
}

async function vaultData(home?: string): Promise<Record<string, string>> {
  const vault = await readLocalProvidersVault(getLocalProvidersVaultPath(home));
  return vault?.data ?? {};
}

export async function resolveCloudflareApiToken(home?: string): Promise<string | undefined> {
  return (
    envTrim("CLAWQL_CLOUDFLARE_API_TOKEN") ??
    envTrim("CLOUDFLARE_API_TOKEN") ??
    (await vaultData(home)).cloudflareApiToken
  );
}

export async function resolveR2AccountId(home?: string): Promise<string | undefined> {
  const vault = await vaultData(home);
  return (
    envTrim("CLAWQL_R2_ACCOUNT_ID") ??
    envTrim("CLAWQL_CLOUDFLARE_ACCOUNT_ID") ??
    envTrim("CLOUDFLARE_ACCOUNT_ID") ??
    vault.cloudflareAccountId
  );
}

function isNotFoundError(e: unknown): boolean {
  const err = e as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
    message?: string;
  };
  const status = err.$metadata?.httpStatusCode;
  if (status === 404 || status === 403) {
    // 403 on HeadBucket often means "no such bucket" for S3 (privacy).
    // Treat 403 as "try create" only when name looks like missing-bucket paths;
    // for HeadBucket, AWS returns 404 or 403 for missing — we try create next.
  }
  if (status === 404) return true;
  const name = err.name ?? err.Code ?? "";
  if (
    name === "NotFound" ||
    name === "NoSuchBucket" ||
    name === "NotFoundException" ||
    name === "404"
  ) {
    return true;
  }
  // AWS HeadBucket missing → 404 or 403 Forbidden
  if (status === 403 && /HeadBucket|Not Found|NoSuchBucket/i.test(String(err.message ?? name))) {
    return true;
  }
  if (status === 403) return true;
  return false;
}

function isBucketAlreadyOwnedError(e: unknown): boolean {
  const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const name = err.name ?? err.Code ?? "";
  return (
    name === "BucketAlreadyOwnedByYou" ||
    name === "BucketAlreadyExists" ||
    err.$metadata?.httpStatusCode === 409
  );
}

type S3Like = { send: (command: unknown) => Promise<unknown> };

function buildS3ClientForEnsure(
  provider: SyncProvider,
  bucketHint: string,
  home: string | undefined,
  createS3Client: EnsureBucketOptions["createS3Client"]
): { client: S3Like; region: string } {
  const resolved = resolveHomeSyncConfig(
    { version: 1, provider, bucket: bucketHint },
    home ?? process.env.CLAWQL_HOME ?? "/tmp/.ClawQL"
  );
  const creds = resolveSyncCredentials(resolved);
  const endpoint = resolveSyncEndpoint(resolved);
  const profile = syncProviderProfile(provider);
  const region = resolved.region ?? profile.defaultRegion ?? "us-east-1";
  const clientConfig: S3ClientConfig = {
    credentials: creds,
    region,
  };
  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.forcePathStyle = profile.forcePathStyle;
  }
  const client = createS3Client
    ? createS3Client(clientConfig)
    : (new S3Client(clientConfig) as unknown as S3Like);
  return { client, region };
}

async function headOrCreateViaS3(opts: {
  client: S3Like;
  bucket: string;
  region: string;
  provider: SyncProvider;
  dryRun: boolean;
}): Promise<{ created: boolean; method: EnsureBucketMethod } | null> {
  const { client, bucket, region, provider, dryRun } = opts;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { created: false, method: "already-exists" };
  } catch (e) {
    if (!isNotFoundError(e)) {
      // Credentials may lack HeadBucket — fall through to other methods.
      return null;
    }
  }

  if (dryRun) {
    return { created: true, method: "s3-api" };
  }

  try {
    const input: {
      Bucket: string;
      CreateBucketConfiguration?: { LocationConstraint: BucketLocationConstraint };
    } = { Bucket: bucket };
    if (provider === "s3" && region && region !== "us-east-1") {
      input.CreateBucketConfiguration = {
        LocationConstraint: region as BucketLocationConstraint,
      };
    }
    await client.send(new CreateBucketCommand(input));
    return { created: true, method: "s3-api" };
  } catch (e) {
    if (isBucketAlreadyOwnedError(e)) {
      return { created: false, method: "already-exists" };
    }
    return null;
  }
}

type CloudflareApiResult = { created: boolean; method: EnsureBucketMethod };

export async function ensureR2BucketViaCloudflareApi(opts: {
  accountId: string;
  token: string;
  bucket: string;
  locationHint?: string;
  dryRun?: boolean;
  fetchFn?: typeof fetch;
}): Promise<CloudflareApiResult> {
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
    return { created: false, method: "already-exists" };
  }
  if (getRes.status !== 404 && getRes.status !== 400) {
    const body = await getRes.text().catch(() => "");
    throw new Error(
      `Cloudflare R2 get bucket failed (${getRes.status}): ${body.slice(0, 300) || getRes.statusText}`
    );
  }

  if (opts.dryRun) {
    return { created: true, method: "cloudflare-api" };
  }

  const payload: Record<string, string> = { name: opts.bucket };
  if (opts.locationHint?.trim()) {
    payload.locationHint = opts.locationHint.trim().toLowerCase();
  }

  const createRes = await fetchFn(base, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (createRes.ok || createRes.status === 409) {
    return {
      created: createRes.status !== 409,
      method: createRes.status === 409 ? "already-exists" : "cloudflare-api",
    };
  }
  const body = await createRes.text().catch(() => "");
  // Already exists sometimes returns 400 with specific errors
  if (/already exists|10004|conflict/i.test(body)) {
    return { created: false, method: "already-exists" };
  }
  throw new Error(
    `Cloudflare R2 create bucket failed (${createRes.status}): ${body.slice(0, 400) || createRes.statusText}`
  );
}

function gcsEnsureError(): Error {
  return new Error(
    "GCS bucket auto-create is not supported (HMAC keys cannot create buckets). " +
      "Create the bucket in GCP Console, then run: clawql sync init --provider gcs --bucket <name>"
  );
}

/**
 * Ensure the team vault bucket exists and write `$CLAWQL_HOME/sync.json`.
 */
export async function ensureSyncBucket(
  opts: EnsureBucketOptions = {}
): Promise<EnsureBucketResult> {
  const home = opts.home;
  const provider = parseSyncProvider(opts.provider ?? envTrim("CLAWQL_SYNC_PROVIDER") ?? "r2");
  if (provider === "gcs") {
    throw gcsEnsureError();
  }

  const existing = home
    ? await readSyncConfigFile(getSyncConfigPath(home))
    : await readSyncConfigFile();
  const bucket = normalizeBucketName(
    opts.bucket?.trim() || existing?.bucket || defaultEnsureBucketName(provider)
  );
  if (!bucket) {
    throw new Error("Bucket name is empty after normalization");
  }
  const prefixRaw = opts.prefix ?? existing?.prefix ?? defaultEnsurePrefix();
  const prefix =
    prefixRaw.endsWith("/") || !prefixRaw ? prefixRaw || DEFAULT_SYNC_PREFIX : `${prefixRaw}/`;
  const dryRun = Boolean(opts.dryRun);
  const configPath = getSyncConfigPath(home);
  const location =
    opts.location?.trim() || envTrim("CLAWQL_SYNC_LOCATION") || DEFAULT_R2_LOCATION_HINT;

  let created = false;
  let method: EnsureBucketMethod = "config-only";

  if (provider === "r2" || provider === "s3") {
    // 1) Prefer S3-compatible Head/Create when sync (or AWS) keys are present.
    try {
      const { client, region } = buildS3ClientForEnsure(
        provider,
        bucket,
        home,
        opts.createS3Client
      );
      const s3Result = await headOrCreateViaS3({
        client,
        bucket,
        region,
        provider,
        dryRun,
      });
      if (s3Result) {
        created = s3Result.created;
        method = s3Result.method;
      }
    } catch {
      // Missing sync credentials — try Cloudflare API for R2 next.
    }

    if (method === "config-only" && provider === "r2") {
      const token = await resolveCloudflareApiToken(home);
      const accountId = await resolveR2AccountId(home);
      if (!token) {
        throw new Error(
          "Cannot ensure R2 bucket — need either (A) R2 S3 API keys with Admin CreateBucket " +
            "(CLAWQL_SYNC_ACCESS_KEY_ID / CLAWQL_SYNC_SECRET_ACCESS_KEY) that can Head/Create, or " +
            "(B) CLOUDFLARE_API_TOKEN / CLAWQL_CLOUDFLARE_API_TOKEN with Workers R2 Storage Write, " +
            "plus CLAWQL_R2_ACCOUNT_ID."
        );
      }
      if (!accountId) {
        throw new Error(
          "Cannot ensure R2 bucket — set CLAWQL_R2_ACCOUNT_ID (Cloudflare account id)."
        );
      }
      const cf = await ensureR2BucketViaCloudflareApi({
        accountId,
        token,
        bucket,
        locationHint: location,
        dryRun,
        fetchFn: opts.fetchFn,
      });
      created = cf.created;
      method = cf.method;
    } else if (method === "config-only" && provider === "s3") {
      throw new Error(
        "Cannot ensure S3 bucket — set CLAWQL_AWS_ACCESS_KEY_ID / CLAWQL_AWS_SECRET_ACCESS_KEY " +
          "(or CLAWQL_SYNC_*) with s3:CreateBucket + s3:ListBucket (HeadBucket), " +
          "plus CLAWQL_AWS_REGION or CLAWQL_SYNC_REGION."
      );
    }
  }

  if (!opts.skipWriteConfig && !dryRun) {
    const config: HomeSyncConfigFile = {
      version: 1,
      provider,
      bucket,
      prefix,
    };
    await writeSyncConfigFile(config, configPath);
  }

  return {
    provider,
    bucket,
    prefix,
    created,
    method,
    dryRun,
    configPath,
  };
}
