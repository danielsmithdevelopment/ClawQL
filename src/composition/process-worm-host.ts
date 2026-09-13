/**
 * Boot process clawql-audit WORM + register host sinks (memory; auth sink exported).
 * Call once at MCP/HTTP process start when CLAWQL_WORM_ENABLED=1.
 */

import {
  bootProcessWormFromEnv,
  createAuthEventWormSink,
  createMemoryWormSink,
  stopProcessWorm,
} from "clawql-audit";
import { registerMemoryWormSink } from "clawql-memory/okf";

let memoryUnsub: (() => void) | undefined;
let booted = false;

/**
 * Best-effort boot. Safe when WORM is disabled. Idempotent.
 */
export async function ensureProcessWormHostBooted(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (booted) return;
  booted = true;
  const svc = await bootProcessWormFromEnv(env);
  if (!svc) return;
  memoryUnsub = registerMemoryWormSink(createMemoryWormSink());
  if (env.CLAWQL_WORM_DEBUG?.trim() === "1") {
    process.stderr.write("[clawql] process WORM trail ready (clawql-audit)\n");
  }
}

/** AuthEventSink for createAuth({ authEventSink }) — no-ops until trail is booted. */
export function getProcessWormAuthEventSink() {
  return createAuthEventWormSink();
}

export async function disposeProcessWormHost(): Promise<void> {
  memoryUnsub?.();
  memoryUnsub = undefined;
  booted = false;
  await stopProcessWorm();
}
