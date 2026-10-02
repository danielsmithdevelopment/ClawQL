import { Effect } from "effect";
/** Optional post-ingest / pre-recall hooks (wired from MCP transport for team bucket sync). */

export type VaultSyncHook = () => void | Promise<void>;

let afterIngestHook: VaultSyncHook | null = null;
let beforeRecallHook: VaultSyncHook | null = null;

export function configureVaultSyncHooks(hooks: {
  afterIngest?: VaultSyncHook | null;
  beforeRecall?: VaultSyncHook | null;
}): void {
  if (hooks.afterIngest !== undefined) afterIngestHook = hooks.afterIngest;
  if (hooks.beforeRecall !== undefined) beforeRecallHook = hooks.beforeRecall;
}

export function resetVaultSyncHooksForTests(): void {
  afterIngestHook = null;
  beforeRecallHook = null;
}

async function runAfterIngestVaultSyncImpl(): Promise<void>  {
  if (!afterIngestHook) return;
  try {
    await afterIngestHook();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] vault sync after ingest failed: ${msg}`);
  }
}

export function runAfterIngestVaultSyncEffect(): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => runAfterIngestVaultSyncImpl(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runAfterIngestVaultSyncEffect} for Effect callers. */
export async function runAfterIngestVaultSync(): Promise<void>  {
  return Effect.runPromise(runAfterIngestVaultSyncEffect());
}

async function runBeforeRecallVaultSyncImpl(): Promise<void>  {
  if (!beforeRecallHook) return;
  try {
    await beforeRecallHook();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[clawql-mcp] vault sync before recall failed: ${msg}`);
  }
}

export function runBeforeRecallVaultSyncEffect(): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => runBeforeRecallVaultSyncImpl(),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runBeforeRecallVaultSyncEffect} for Effect callers. */
export async function runBeforeRecallVaultSync(): Promise<void>  {
  return Effect.runPromise(runBeforeRecallVaultSyncEffect());
}
