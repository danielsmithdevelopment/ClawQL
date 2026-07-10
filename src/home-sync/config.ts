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

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

export function parseSyncProvider(raw: string | undefined): SyncProvider {
  const v = raw?.trim().toLowerCase();
  if (!v || v === "r2") return "r2";
  if (v === "s3") return "s3";
  if (v === "gcs") return "gcs";
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
    (provider === "r2" ? "auto" : provider === "gcs" ? "auto" : undefined);
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

export function resolveSyncCredentials(): SyncCredentials {
  const accessKeyId =
    envTrim("CLAWQL_SYNC_ACCESS_KEY_ID") ??
    envTrim("AWS_ACCESS_KEY_ID") ??
    envTrim("AWS_ACCESS_KEY");
  const secretAccessKey =
    envTrim("CLAWQL_SYNC_SECRET_ACCESS_KEY") ??
    envTrim("AWS_SECRET_ACCESS_KEY") ??
    envTrim("AWS_SECRET_KEY");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Sync credentials missing — set CLAWQL_SYNC_ACCESS_KEY_ID and CLAWQL_SYNC_SECRET_ACCESS_KEY " +
        "(R2: create S3 API tokens in Cloudflare dashboard; store as r2AccessKeyId / r2SecretAccessKey in vault)"
    );
  }
  return { accessKeyId, secretAccessKey };
}

export function resolveSyncEndpoint(config: ResolvedHomeSyncConfig): string | undefined {
  if (config.endpoint?.trim()) return config.endpoint.trim();
  if (config.provider === "gcs") return "https://storage.googleapis.com";
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
