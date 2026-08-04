import { configureVaultSyncHooks } from "clawql-memory/sync/vault-sync-hooks";
import {
  flushPendingAutoPush,
  maybeAutoPullBeforeRecall,
  runAutoPullOnStartup,
  scheduleAutoPushAfterIngest,
} from "./home-sync/auto.js";

let wired = false;
let shutdownHooksRegistered = false;

/** Wire debounced team bucket sync to memory ingest/recall (idempotent). */
export function configureHomeSyncHooks(): void {
  if (wired) return;
  wired = true;
  configureVaultSyncHooks({
    afterIngest: scheduleAutoPushAfterIngest,
    beforeRecall: maybeAutoPullBeforeRecall,
  });
  void runAutoPullOnStartup();
  registerHomeSyncShutdownHooks();
}

function registerHomeSyncShutdownHooks(): void {
  if (shutdownHooksRegistered) return;
  shutdownHooksRegistered = true;
  const flush = (): void => {
    void flushPendingAutoPush().catch(() => undefined);
  };
  process.once("SIGINT", flush);
  process.once("SIGTERM", flush);
  process.once("beforeExit", flush);
}

export function resetHomeSyncHooksForTests(): void {
  wired = false;
  configureVaultSyncHooks({ afterIngest: null, beforeRecall: null });
}
