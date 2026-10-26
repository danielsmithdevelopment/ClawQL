export type SyncProvider = "r2" | "s3" | "gcs";

/** Local config at `$CLAWQL_HOME/sync.json` (no secrets). */
export type HomeSyncConfigFile = {
  version: 1;
  provider: SyncProvider;
  bucket: string;
  /** Object key prefix, e.g. `teams/acme/` — shared by the whole team. */
  prefix?: string;
  /** Override S3 endpoint (R2/GCS interop). */
  endpoint?: string;
  region?: string;
  /** Relative paths under CLAWQL_HOME to include (files or directories). */
  include?: string[];
};

export type ResolvedHomeSyncConfig = HomeSyncConfigFile & {
  home: string;
  include: string[];
  manifestKey: string;
};

export type SyncFileEntry = {
  sha256: string;
  size: number;
  mtimeMs: number;
};

/**
 * Remote manifest at `{prefix}.clawql/sync/manifest.v1.json`.
 * Pull / `sync status` / `memory_sync` compare against this index — not a raw
 * bucket listing. Push must merge remote-only paths (`mergeManifestFiles`) so a
 * sparse local vault cannot drop team notes from the index while objects remain.
 */
export type SyncManifest = {
  version: 1;
  updatedAt: string;
  files: Record<string, SyncFileEntry>;
};

export type SyncAction = "upload" | "download" | "skip" | "conflict";

export type SyncPlanEntry = {
  path: string;
  action: SyncAction;
  reason: string;
};

export type SyncRunResult = {
  provider: SyncProvider;
  bucket: string;
  prefix: string;
  uploaded: number;
  downloaded: number;
  skipped: number;
  conflicts: number;
  dryRun: boolean;
  actions: SyncPlanEntry[];
};
