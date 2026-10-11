import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Effect } from "effect";
import { absPathForRel, collectLocalSyncFilesEffect } from "./collect.js";
import {
  contentTypeForRelPath,
  createDefaultObjectStorageClientEffect,
  fetchRemoteManifestEffect,
} from "./object-storage.js";
import { objectKeyForRelPath } from "./paths.js";
import type {
  ResolvedHomeSyncConfig,
  SyncManifest,
  SyncPlanEntry,
  SyncRunResult,
} from "./types.js";
import type { ObjectStorageClient } from "./object-storage.js";
import { assertManifestSha256 } from "./verify.js";

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
  force: boolean
): SyncPlanEntry[] {
  const actions: SyncPlanEntry[] = [];
  if (!remote) return actions;
  for (const [path, remoteEntry] of Object.entries(remote.files)) {
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
    await writeFile(abs, body);
    count += 1;
  }
  return count;
}

function writeRemoteManifestEffect(
  client: ObjectStorageClient,
  config: ResolvedHomeSyncConfig,
  home: string,
  dryRun: boolean
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const files = yield* collectLocalSyncFilesEffect(home, config.include);
    const manifest: SyncManifest = {
      version: 1,
      updatedAt: new Date().toISOString(),
      files: Object.fromEntries(files),
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
    const actions = planPush(localHashes, remote, Boolean(opts.force));
    const dryRun = Boolean(opts.dryRun);
    const uploaded = yield* Effect.tryPromise({
      try: () => applyUploads(client, config, config.home, actions, dryRun),
      catch: asError,
    });
    if (!dryRun) yield* writeRemoteManifestEffect(client, config, config.home, false);
    return summarize(config, actions, uploaded, 0, dryRun);
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
    const actions = planPull(localHashes, remote, Boolean(opts.force));
    const dryRun = Boolean(opts.dryRun);
    const downloaded = yield* Effect.tryPromise({
      try: () => applyDownloads(client, config, config.home, actions, dryRun, remote),
      catch: asError,
    });
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
