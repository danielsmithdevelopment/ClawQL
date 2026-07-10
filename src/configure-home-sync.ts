import { configureVaultSyncHooks } from "clawql-memory/sync/vault-sync-hooks";
import {
  maybeAutoPullBeforeRecall,
  runAutoPullOnStartup,
  scheduleAutoPushAfterIngest,
} from "./home-sync/auto.js";

let wired = false;

/** Wire debounced team bucket sync to memory ingest/recall (idempotent). */
export function configureHomeSyncHooks(): void {
  if (wired) return;
  wired = true;
  configureVaultSyncHooks({
    afterIngest: scheduleAutoPushAfterIngest,
    beforeRecall: maybeAutoPullBeforeRecall,
  });
  void runAutoPullOnStartup();
}

export function resetHomeSyncHooksForTests(): void {
  wired = false;
  configureVaultSyncHooks({ afterIngest: null, beforeRecall: null });
}
