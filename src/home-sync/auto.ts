import { runSyncPull, runSyncPush } from "./engine.js";
import { loadResolvedHomeSyncConfig } from "./config.js";

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

function envFlagOn(key: string): boolean {
  const v = process.env[key]?.trim();
  return v === "1" || v === "true";
}

function envFlagOff(key: string): boolean {
  const v = process.env[key]?.trim();
  return v === "0" || v === "false";
}

export function autoPushExplicitlyEnabled(): boolean {
  if (envFlagOff("CLAWQL_SYNC_AUTO")) return false;
  return envFlagOn("CLAWQL_SYNC_AUTO");
}

export function autoPullEnabled(): boolean {
  if (envFlagOff("CLAWQL_SYNC_AUTO_PULL")) return false;
  return envFlagOn("CLAWQL_SYNC_AUTO_PULL");
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
let lastPullMs = 0;
let pullInFlight = false;

export function resetHomeSyncAutoForTests(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pushInFlight = false;
  lastPullMs = 0;
  pullInFlight = false;
}

/** Debounced push after memory_ingest (and similar writes). */
export function scheduleAutoPushAfterIngest(): void {
  if (!autoPushExplicitlyEnabled()) return;
  const debounceMs = envInt("CLAWQL_SYNC_AUTO_DEBOUNCE_MS", 30_000);
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushAutoPush();
  }, debounceMs);
}

async function flushAutoPush(): Promise<void> {
  if (pushInFlight) return;
  pushInFlight = true;
  try {
    await loadResolvedHomeSyncConfig();
    const result = await runSyncPush({});
    if (result.uploaded > 0) {
      console.error(
        `[clawql-mcp] team sync auto-push: uploaded ${result.uploaded} file(s) to ${result.provider}://${result.bucket}/${result.prefix}`
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] team sync auto-push failed: ${msg}`);
  } finally {
    pushInFlight = false;
  }
}

/** Throttled pull before memory_recall when CLAWQL_SYNC_AUTO_PULL=1. */
export async function maybeAutoPullBeforeRecall(): Promise<void> {
  if (!autoPullEnabled()) return;
  const minIntervalMs = envInt("CLAWQL_SYNC_AUTO_PULL_MIN_MS", 60_000);
  const now = Date.now();
  if (pullInFlight || now - lastPullMs < minIntervalMs) return;
  pullInFlight = true;
  lastPullMs = now;
  try {
    await loadResolvedHomeSyncConfig();
    const result = await runSyncPull({});
    if (result.downloaded > 0) {
      console.error(
        `[clawql-mcp] team sync auto-pull: downloaded ${result.downloaded} file(s) before recall`
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] team sync auto-pull failed: ${msg}`);
  } finally {
    pullInFlight = false;
  }
}

/** Optional pull on MCP startup (CLAWQL_SYNC_AUTO_PULL_ON_START=1). */
export async function runAutoPullOnStartup(): Promise<void> {
  if (!envFlagOn("CLAWQL_SYNC_AUTO_PULL_ON_START")) return;
  try {
    await loadResolvedHomeSyncConfig();
    const result = await runSyncPull({});
    console.error(`[clawql-mcp] team sync startup pull: downloaded ${result.downloaded} file(s)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] team sync startup pull failed: ${msg}`);
  }
}
