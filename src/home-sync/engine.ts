import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { absPathForRel, collectLocalSyncFilesEffect, isExcludedRel } from "./collect.js";
import {
  contentTypeForRelPath,
  createDefaultObjectStorageClientEffect,
  fetchRemoteManifestEffect,
  type ObjectStorageClient,
} from "./object-storage.js";
import { objectKeyForRelPath } from "./paths.js";
import type {
  ResolvedHomeSyncConfig,
  SyncFileEntry,
  SyncManifest,
  SyncPlanEntry,
  SyncRunResult,
} from "./types.js";
import { assertManifestSha256 } from "./verify.js";

function normalizeSyncPath(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Merge local + remote shared erasure tombstones (audit U1). */
export function mergeErasureTombstones(
  local: ReadonlySet<string>,
  remote: SyncManifest | null
): Set<string> {
  const out = new Set<string>();
  for (const p of local) out.add(normalizeSyncPath(p));
  for (const p of remote?.erasureTombstones ?? []) {
    if (typeof p === "string" && p.trim()) out.add(normalizeSyncPath(p));
  }
  return out;
}

async function loadLocalErasureTombstones(home: string): Promise<Set<string>> {
  try {
    const { loadErasureTombstonePaths } = await import("clawql-memory");
    return new Set(await loadErasureTombstonePaths(home));
  } catch {
    return new Set();
  }
}

export type SyncRunOptions = {
  dryRun?: boolean;
  force?: boolean;
};

export type SyncStatusResult = {
  config: ResolvedHomeSyncConfig;
  localCount: number;
  remoteCount: number;
  inSync: number;
  localOnly: string[];
  remoteOnly: string[];
  conflicts: string[];
};

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function planPush(
  local: Map<string, { sha256: string }>,
  remote: SyncManifest | null,
  force: boolean
): SyncPlanEntry[] {
  const actions: SyncPlanEntry[] = [];
  const remoteFiles = remote?.files ?? {};
  for (const [path, entry] of local) {
    const remoteEntry = remoteFiles[path];
    if (!remoteEntry) {
      actions.push({ path, action: "upload", reason: "new locally" });
    } else if (remoteEntry.sha256 === entry.sha256) {
      actions.push({ path, action: "skip", reason: "in sync" });
    } else {
      actions.push({
        path,
        action: force ? "upload" : "conflict",
        reason: force ? "force overwrite remote" : "remote differs (use --force)",
      });
    }
  }
  return actions;
}

function planPull(
  local: Map<string, { sha256: string }>,
  remote: SyncManifest | null,
  force: boolean,
  erasureTombstones: ReadonlySet<string> = new Set()
): SyncPlanEntry[] {
  const actions: SyncPlanEntry[] = [];
  if (!remote) return actions;
  for (const [path, remoteEntry] of Object.entries(remote.files)) {
    // Never pull secrets / auth / WORM even if a teammate's manifest lists them.
    if (isExcludedRel(path)) {
      actions.push({ path, action: "skip", reason: "excluded from pull" });
      continue;
    }
    // Audit 4.07 / U1: erased notes must not come back from the team bucket.
    if (erasureTombstones.has(normalizeSyncPath(path))) {
      actions.push({ path, action: "skip", reason: "erasure tombstone" });
      continue;
    }
    const localEntry = local.get(path);
    if (!localEntry) {
      actions.push({ path, action: "download", reason: "new on remote" });
    } else if (localEntry.sha256 === remoteEntry.sha256) {
      actions.push({ path, action: "skip", reason: "in sync" });
    } else {
      actions.push({
        path,
        action: force ? "download" : "conflict",
        reason: force ? "force overwrite local" : "local differs (use --force)",
      });
    }
  }
  return actions;
}

async function applyUploads(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig,
  home: string,
  actions: SyncPlanEntry[],
  dryRun: boolean
): Promise<number> {
  let count = 0;
  for (const a of actions) {
    if (a.action !== "upload") continue;
    const key = objectKeyForRelPath(config.prefix ?? "", a.path);
    if (dryRun) {
      count += 1;
      continue;
    }
    const abs = absPathForRel(home, a.path);
    const body = await readFile(abs);
    await client.putBytes(key, body, contentTypeForRelPath(a.path));
    count += 1;
  }
  return count;
}

async function applyDownloads(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig,
  home: string,
  actions: SyncPlanEntry[],
  dryRun: boolean,
  remote: SyncManifest | null
): Promise<number> {
  let count = 0;
  const remoteFiles = remote?.files ?? {};
  for (const a of actions) {
    if (a.action !== "download") continue;
    if (isExcludedRel(a.path)) continue;
    const key = objectKeyForRelPath(config.prefix ?? "", a.path);
    if (dryRun) {
      count += 1;
      continue;
    }
    const body = await client.getBytes(key);
    if (!body) continue;
    const expected = remoteFiles[a.path]?.sha256;
    if (expected) {
      assertManifestSha256(a.path, body, expected);
    }
    const abs = absPathForRel(home, a.path);
    await mkdir(dirname(abs), { recursive: true });
    const tmp = `${abs}.clawql-sync-tmp`;
    await writeFile(tmp, body);
    await rename(tmp, abs);
    count += 1;
  }
  return count;
}

/**
 * Build the post-push manifest: local entries win on overlap, but remote-only
 * paths are retained. Push must not replace the team index with a sparse local
 * vault (that drops hundreds of notes from pull while leaving R2 objects intact).
 */
export function mergeManifestFiles(
  local: Map<string, SyncFileEntry>,
  remote: SyncManifest | null,
  erasureTombstones: ReadonlySet<string> = new Set()
): Record<string, SyncFileEntry> {
  const files: Record<string, SyncFileEntry> = {};
  if (remote?.files) {
    for (const [path, entry] of Object.entries(remote.files)) {
      if (erasureTombstones.has(normalizeSyncPath(path))) continue;
      files[path] = entry;
    }
  }
  for (const [path, entry] of local) {
    if (erasureTombstones.has(normalizeSyncPath(path))) continue;
    files[path] = entry;
  }
  return files;
}

/** Delete bucket objects for newly shared erasure tombstones (audit U1). */
async function applyTombstoneDeletes(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig,
  remote: SyncManifest | null,
  erasureTombstones: ReadonlySet<string>,
  dryRun: boolean
): Promise<SyncPlanEntry[]> {
  const remoteFiles = remote?.files ?? {};
  const alreadyShared = new Set((remote?.erasureTombstones ?? []).map((p) => normalizeSyncPath(p)));
  const actions: SyncPlanEntry[] = [];
  for (const path of erasureTombstones) {
    const norm = normalizeSyncPath(path);
    // Delete when the object is still listed, or this is a new shared tombstone.
    if (!remoteFiles[path] && !remoteFiles[norm] && alreadyShared.has(norm)) continue;
    actions.push({ path: norm, action: "delete", reason: "erasure tombstone" });
    if (dryRun) continue;
    const key = objectKeyForRelPath(config.prefix ?? "", norm);
    await client.deleteObject(key);
  }
  return actions;
}

function writeRemoteManifestEffect(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig,
  local: Map<string, SyncFileEntry>,
  remote: SyncManifest | null,
  dryRun: boolean,
  erasureTombstones: ReadonlySet<string> = new Set()
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const tombstoneList = [...erasureTombstones].sort();
    const manifest: SyncManifest = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: mergeManifestFiles(local, remote, erasureTombstones),
      erasureTombstones: tombstoneList,
    };
    if (dryRun) return;
    yield* Effect.tryPromise({
      try: () => client.putJson(config.manifestKey, manifest),
      catch: asError,
    });
  });
}

export function runSyncPushEffect(opts: SyncRunOptions = {}): Effect.Effect<SyncRunResult, Error> {
  return Effect.gen(function* () {
    const { client, config } = yield* createDefaultObjectStorageClientEffect();
    const local = yield* collectLocalSyncFilesEffect(config.home, config.include);
    const remote = yield* fetchRemoteManifestEffect(client, config);
    const localHashes = new Map([...local.entries()].map(([k, v]) => [k, { sha256: v.sha256 }]));
    const localTombs = yield* Effect.tryPromise({
      try: () => loadLocalErasureTombstones(config.home),
      catch: asError,
    }).pipe(Effect.orElseSucceed(() => new Set<string>()));
    let tombstones = mergeErasureTombstones(localTombs, remote);
    // Audit V2: a local file at a tombstoned path is intentional reuse — clear tombstone.
    const reused: string[] = [];
    for (const path of [...tombstones]) {
      if (!local.has(path) && !local.has(normalizeSyncPath(path))) continue;
      reused.push(path);
      tombstones.delete(path);
    }
    if (!opts.dryRun && reused.length) {
      yield* Effect.tryPromise({
        try: async () => {
          const { clearErasureTombstonePath } = await import("clawql-memory");
          for (const p of reused) {
            await clearErasureTombstonePath(config.home, p).catch(() => undefined);
          }
        },
        catch: asError,
      }).pipe(Effect.ignore);
    }
    const actions = planPush(localHashes, remote, Boolean(opts.force)).filter(
      (a) => !tombstones.has(normalizeSyncPath(a.path))
    );
    const dryRun = Boolean(opts.dryRun);
    const uploaded = yield* Effect.tryPromise({
      try: () => applyUploads(client, config, config.home, actions, dryRun),
      catch: asError,
    });
    const deleteActions = yield* Effect.tryPromise({
      try: () => applyTombstoneDeletes(client, config, remote, tombstones, dryRun),
      catch: asError,
    });
    if (!dryRun) yield* writeRemoteManifestEffect(client, config, local, remote, false, tombstones);
    return summarize(config, [...actions, ...deleteActions], uploaded, 0, dryRun);
  });
}

/** Promise façade — prefer {@link runSyncPushEffect}. */
export async function runSyncPush(opts: SyncRunOptions = {}): Promise<SyncRunResult> {
  return Effect.runPromise(runSyncPushEffect(opts));
}

export function runSyncPullEffect(opts: SyncRunOptions = {}): Effect.Effect<SyncRunResult, Error> {
  return Effect.gen(function* () {
    const { client, config } = yield* createDefaultObjectStorageClientEffect();
    const local = yield* collectLocalSyncFilesEffect(config.home, config.include);
    const remote = yield* fetchRemoteManifestEffect(client, config);
    const localHashes = new Map([...local.entries()].map(([k, v]) => [k, { sha256: v.sha256 }]));
    const localTombs = yield* Effect.tryPromise({
      try: () => loadLocalErasureTombstones(config.home),
      catch: asError,
    }).pipe(Effect.orElseSucceed(() => new Set<string>()));
    // U1: teammates honor shared manifest tombstones even without a local erase file.
    const tombstones = mergeErasureTombstones(localTombs, remote);
    const actions = planPull(localHashes, remote, Boolean(opts.force), tombstones);
    const dryRun = Boolean(opts.dryRun);
    const downloaded = yield* Effect.tryPromise({
      try: () => applyDownloads(client, config, config.home, actions, dryRun, remote),
      catch: asError,
    });
    // Drop any local copy that a teammate erased (shared tombstone) + derived indexes (V1).
    if (!dryRun) {
      for (const path of tombstones) {
        if (!local.has(path) && !local.has(normalizeSyncPath(path))) continue;
        const abs = absPathForRel(config.home, path);
        yield* Effect.tryPromise({
          try: () => unlink(abs).catch(() => undefined),
          catch: asError,
        }).pipe(Effect.ignore);
        yield* Effect.tryPromise({
          try: async () => {
            const { purgeDerivedStoresForVaultPath } = await import("clawql-memory");
            await purgeDerivedStoresForVaultPath(config.home, path);
          },
          catch: asError,
        }).pipe(Effect.ignore);
      }
    }
    return summarize(config, actions, 0, downloaded, dryRun);
  });
}

/** Promise façade — prefer {@link runSyncPullEffect}. */
export async function runSyncPull(opts: SyncRunOptions = {}): Promise<SyncRunResult> {
  return Effect.runPromise(runSyncPullEffect(opts));
}

export function runSyncStatusEffect(): Effect.Effect<SyncStatusResult, Error> {
  return Effect.gen(function* () {
    const { client, config } = yield* createDefaultObjectStorageClientEffect();
    const local = yield* collectLocalSyncFilesEffect(config.home, config.include);
    const remote = yield* fetchRemoteManifestEffect(client, config);
    const remoteFiles = remote?.files ?? {};
    const localOnly: string[] = [];
    const remoteOnly: string[] = [];
    const conflicts: string[] = [];
    let inSync = 0;

    for (const [path, entry] of local) {
      const r = remoteFiles[path];
      if (!r) localOnly.push(path);
      else if (r.sha256 === entry.sha256) inSync += 1;
      else conflicts.push(path);
    }
    for (const path of Object.keys(remoteFiles)) {
      if (!local.has(path)) remoteOnly.push(path);
    }

    return {
      config,
      localCount: local.size,
      remoteCount: Object.keys(remoteFiles).length,
      inSync,
      localOnly,
      remoteOnly,
      conflicts,
    };
  });
}

/** Promise façade — prefer {@link runSyncStatusEffect}. */
export async function runSyncStatus(): Promise<SyncStatusResult> {
  return Effect.runPromise(runSyncStatusEffect());
}

function summarize(
  config: ResolvedHomeSyncConfig,
  actions: SyncPlanEntry[],
  uploaded: number,
  downloaded: number,
  dryRun: boolean
): SyncRunResult {
  const skipped = actions.filter((a) => a.action === "skip").length;
  const conflicts = actions.filter((a) => a.action === "conflict").length;
  return {
    provider: config.provider,
    bucket: config.bucket,
    prefix: config.prefix ?? "",
    uploaded,
    downloaded,
    skipped,
    conflicts,
    dryRun,
    actions,
  };
}

export function formatSyncResult(result: SyncRunResult, mode: "push" | "pull"): string {
  const lines: string[] = [];
  lines.push(
    `${mode === "push" ? "Push" : "Pull"} ${result.dryRun ? "(dry run) " : ""}` +
      `→ ${result.provider}://${result.bucket}/${result.prefix || ""}`
  );
  if (mode === "push") lines.push(`  uploaded: ${result.uploaded}`);
  else lines.push(`  downloaded: ${result.downloaded}`);
  lines.push(`  skipped:  ${result.skipped}`);
  const deleted = result.actions.filter((a) => a.action === "delete").length;
  if (deleted) lines.push(`  deleted:  ${deleted} (erasure tombstones)`);
  if (result.conflicts) lines.push(`  conflicts: ${result.conflicts} (use --force to overwrite)`);
  const interesting = result.actions.filter((a) => a.action !== "skip").slice(0, 20);
  if (interesting.length) {
    lines.push("");
    for (const a of interesting) {
      lines.push(`  ${a.action.padEnd(8)} ${a.path} — ${a.reason}`);
    }
    if (result.actions.filter((a) => a.action !== "skip").length > 20) {
      lines.push("  …");
    }
  }
  return lines.join("\n");
}

export function formatSyncStatus(status: SyncStatusResult): string {
  const { config } = status;
  const lines: string[] = [
    `Team sync: ${config.provider}://${config.bucket}/${config.prefix ?? ""}`,
    `  local files:  ${status.localCount}`,
    `  remote files: ${status.remoteCount}`,
    `  in sync:      ${status.inSync}`,
    `  local only:   ${status.localOnly.length}`,
    `  remote only:  ${status.remoteOnly.length}`,
    `  conflicts:    ${status.conflicts.length}`,
  ];
  if (status.conflicts.length) {
    lines.push("");
    lines.push("  Conflicts (both changed):");
    for (const p of status.conflicts.slice(0, 10)) lines.push(`    ${p}`);
    if (status.conflicts.length > 10) lines.push("    …");
  }
  return lines.join("\n");
}
