import { readFile, writeFile } from "node:fs/promises";
import { getClawqlHome } from "../onboarding/paths.js";
import {
  DEFAULT_SYNC_INCLUDE,
  MANIFEST_REL_KEY,
  getSyncConfigPath,
  normalizePrefix,
  objectKeyForRelPath,
} from "./paths.js";
import type { HomeSyncConfigFile, ResolvedHomeSyncConfig, SyncProvider } from "./types.js";
import { syncProviderProfile } from "./providers.js";

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Accept common aliases (`gcp` → `gcs`). */
export function parseSyncProvider(raw: string | undefined): SyncProvider {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "r2") return "r2";
  if (v === "s3" || v === "aws") return "s3";
  if (v === "gcs" || v === "gcp" || v === "google") return "gcs";
  throw new Error(`CLAWQL_SYNC_PROVIDER must be r2, s3, or gcs (got: ${raw})`);
}

function parseConfigFile(raw: unknown): HomeSyncConfigFile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("sync.json must be a JSON object");
  }
  const o = raw as Record<string, unknown>;
  const version = o.version;
  if (version !== 1) throw new Error("sync.json version must be 1");
  const bucket = typeof o.bucket === "string" ? o.bucket.trim() : "";
  if (!bucket) throw new Error("sync.json requires bucket");
  const provider = parseSyncProvider(typeof o.provider === "string" ? o.provider : "r2");
  const prefix = typeof o.prefix === "string" ? o.prefix : undefined;
  const endpoint = typeof o.endpoint === "string" ? o.endpoint.trim() : undefined;
  const region = typeof o.region === "string" ? o.region.trim() : undefined;
  const include = Array.isArray(o.include)
    ? o.include.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;
  return { version: 1, provider, bucket, prefix, endpoint, region, include };
}

export async function readSyncConfigFile(
  configPath = getSyncConfigPath()
): Promise<HomeSyncConfigFile | null> {
  try {
    const raw = await readFile(configPath, "utf8");
    return parseConfigFile(JSON.parse(raw) as unknown);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    throw e;
  }
}

export async function writeSyncConfigFile(
  config: HomeSyncConfigFile,
  configPath = getSyncConfigPath()
): Promise<void> {
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** Merge sync.json with CLAWQL_SYNC_* env overrides (env wins). */
export function resolveHomeSyncConfig(
  file: HomeSyncConfigFile | null,
  home = getClawqlHome()
): ResolvedHomeSyncConfig {
  const provider = parseSyncProvider(envTrim("CLAWQL_SYNC_PROVIDER") ?? file?.provider);
  const bucket = envTrim("CLAWQL_SYNC_BUCKET") ?? file?.bucket?.trim();
  if (!bucket) {
    throw new Error(
      "Sync bucket not configured — run `clawql sync init` or set CLAWQL_SYNC_BUCKET"
    );
  }
  const prefix = normalizePrefix(envTrim("CLAWQL_SYNC_PREFIX") ?? file?.prefix);
  const endpoint = envTrim("CLAWQL_SYNC_ENDPOINT") ?? file?.endpoint;
  const region =
    envTrim("CLAWQL_SYNC_REGION") ??
    file?.region ??
    syncProviderProfile(provider).defaultRegion;
  const include = envTrim("CLAWQL_SYNC_INCLUDE")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ??
    file?.include ?? [...DEFAULT_SYNC_INCLUDE];

  return {
    version: 1,
    provider,
    bucket,
    prefix: prefix || undefined,
    endpoint,
    region,
    include,
    home,
    manifestKey: objectKeyForRelPath(prefix, MANIFEST_REL_KEY),
  };
}

export async function loadResolvedHomeSyncConfig(
  home = getClawqlHome()
): Promise<ResolvedHomeSyncConfig> {
  const file = await readSyncConfigFile(getSyncConfigPath(home));
  return resolveHomeSyncConfig(file, home);
}

export type SyncCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export function resolveSyncCredentials(config: ResolvedHomeSyncConfig): SyncCredentials {
  let accessKeyId: string | undefined;
  let secretAccessKey: string | undefined;

  if (config.provider === "s3") {
    accessKeyId =
      envTrim("CLAWQL_AWS_ACCESS_KEY_ID") ??
      envTrim("AWS_ACCESS_KEY_ID") ??
      envTrim("CLAWQL_SYNC_ACCESS_KEY_ID");
    secretAccessKey =
      envTrim("CLAWQL_AWS_SECRET_ACCESS_KEY") ??
      envTrim("AWS_SECRET_ACCESS_KEY") ??
      envTrim("CLAWQL_SYNC_SECRET_ACCESS_KEY");
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 sync credentials missing — set CLAWQL_AWS_ACCESS_KEY_ID and CLAWQL_AWS_SECRET_ACCESS_KEY " +
          "(or awsAccessKeyId / awsSecretAccessKey in vault), plus CLAWQL_AWS_REGION or CLAWQL_SYNC_REGION"
      );
    }
    return { accessKeyId, secretAccessKey };
  }

  if (config.provider === "gcs") {
    accessKeyId =
      envTrim("CLAWQL_GCS_HMAC_ACCESS_ID") ??
      envTrim("GCS_HMAC_ACCESS_ID") ??
      envTrim("CLAWQL_SYNC_ACCESS_KEY_ID");
    secretAccessKey =
      envTrim("CLAWQL_GCS_HMAC_SECRET") ??
      envTrim("GCS_HMAC_SECRET") ??
      envTrim("CLAWQL_SYNC_SECRET_ACCESS_KEY");
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        "GCS sync credentials missing — create HMAC keys in GCP Console → Cloud Storage → Settings → " +
          "Interoperability, then set CLAWQL_GCS_HMAC_ACCESS_ID and CLAWQL_GCS_HMAC_SECRET " +
          "(or gcsHmacAccessId / gcsHmacSecret in vault)"
      );
    }
    return { accessKeyId, secretAccessKey };
  }

  // R2 (default)
  accessKeyId = envTrim("CLAWQL_SYNC_ACCESS_KEY_ID") ?? envTrim("R2_ACCESS_KEY_ID");
  secretAccessKey = envTrim("CLAWQL_SYNC_SECRET_ACCESS_KEY") ?? envTrim("R2_SECRET_ACCESS_KEY");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 sync credentials missing — set CLAWQL_SYNC_ACCESS_KEY_ID and CLAWQL_SYNC_SECRET_ACCESS_KEY " +
        "(R2 S3 API tokens in Cloudflare dashboard; or r2AccessKeyId / r2SecretAccessKey in vault)"
    );
  }
  return { accessKeyId, secretAccessKey };
}

export function resolveSyncEndpoint(config: ResolvedHomeSyncConfig): string | undefined {
  if (config.endpoint?.trim()) return config.endpoint.trim();
  const profile = syncProviderProfile(config.provider);
  if (profile.defaultEndpoint) return profile.defaultEndpoint;
  if (config.provider === "r2") {
    const accountId =
      envTrim("CLAWQL_R2_ACCOUNT_ID") ??
      envTrim("CLAWQL_CLOUDFLARE_ACCOUNT_ID") ??
      envTrim("CLOUDFLARE_ACCOUNT_ID");
    if (!accountId) {
      throw new Error(
        "R2 endpoint requires CLAWQL_R2_ACCOUNT_ID (or cloudflareAccountId in vault) — " +
          "find it in Cloudflare dashboard → R2 → Overview"
      );
    }
    return `https://${accountId}.r2.cloudflarestorage.com`;
  }
  return undefined;
}
