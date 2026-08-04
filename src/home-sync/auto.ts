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

/**
 * Quiet period after the last ingest before we consider pushing.
 * Coalesces note + index/log writes into one PUT.
 */
export const DEFAULT_AUTO_PUSH_DEBOUNCE_MS = 2_000;

/**
 * Minimum time between successful auto-pushes during sustained ingest.
 * Prevents R2 spam when agents ingest many notes over a long session.
 * Shutdown flush ignores this so notes are not lost on process exit.
 */
export const DEFAULT_AUTO_PUSH_MIN_INTERVAL_MS = 30_000;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
let pushDirty = false;
let lastPushMs = 0;
let lastPullMs = 0;
let pullInFlight = false;

export function resetHomeSyncAutoForTests(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  pushInFlight = false;
  pushDirty = false;
  lastPushMs = 0;
  lastPullMs = 0;
  pullInFlight = false;
}

function debounceMs(): number {
  return envInt("CLAWQL_SYNC_AUTO_DEBOUNCE_MS", DEFAULT_AUTO_PUSH_DEBOUNCE_MS);
}

function minIntervalMs(): number {
  return envInt("CLAWQL_SYNC_AUTO_PUSH_MIN_MS", DEFAULT_AUTO_PUSH_MIN_INTERVAL_MS);
}

function clearPushTimer(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

function armPushTimer(delayMs: number): void {
  clearPushTimer();
  pushTimer = setTimeout(
    () => {
      pushTimer = null;
      void tryAutoPush({ force: false });
    },
    Math.max(0, delayMs)
  );
}

/** Debounced + rate-limited push after memory_ingest (and similar writes). */
export function scheduleAutoPushAfterIngest(): void {
  if (!autoPushExplicitlyEnabled()) return;
  pushDirty = true;
  armPushTimer(debounceMs());
}

/**
 * Cancel timers and push now if there are pending writes (shutdown / explicit flush).
 * Ignores the min-interval throttle so short-lived processes do not drop notes.
 */
export async function flushPendingAutoPush(): Promise<void> {
  if (!autoPushExplicitlyEnabled()) return;
  clearPushTimer();
  if (!pushDirty && !pushInFlight) return;
  await tryAutoPush({ force: true });
}

async function tryAutoPush(opts: { force: boolean }): Promise<void> {
  if (!pushDirty) return;
  if (pushInFlight) return;

  if (!opts.force) {
    const wait = Math.max(0, minIntervalMs() - (Date.now() - lastPushMs));
    if (wait > 0) {
      armPushTimer(wait);
      return;
    }
  }

  pushInFlight = true;
  try {
    await loadResolvedHomeSyncConfig();
    const result = await runSyncPush({});
    pushDirty = false;
    lastPushMs = Date.now();
    if (result.uploaded > 0) {
      console.error(
        `[clawql-mcp] team sync auto-push: uploaded ${result.uploaded} file(s) to ${result.provider}://${result.bucket}/${result.prefix}`
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] team sync auto-push failed: ${msg}`);
    // Keep dirty so a later ingest / shutdown flush can retry.
  } finally {
    pushInFlight = false;
  }
}

/** Throttled pull before memory_recall when CLAWQL_SYNC_AUTO_PULL=1. */
export async function maybeAutoPullBeforeRecall(): Promise<void> {
  if (!autoPullEnabled()) return;
  const minPullMs = envInt("CLAWQL_SYNC_AUTO_PULL_MIN_MS", 60_000);
  const now = Date.now();
  if (pullInFlight || now - lastPullMs < minPullMs) return;
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
