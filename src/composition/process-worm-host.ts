/**
 * Boot process clawql-audit WORM + register host sinks (memory; auth sink exported).
 * Call once at MCP/HTTP process start when CLAWQL_WORM_ENABLED=1.
 */

import {
  bootProcessWormFromEnvEffect,
  createAuthEventWormSink,
  createMemoryWormSink,
  stopProcessWormEffect,
} from "clawql-audit";
import { registerMemoryWormSink } from "clawql-memory/okf";
import { Effect } from "effect";

let memoryUnsub: (() => void) | undefined;
let booted = false;

/**
 * Best-effort boot. Safe when WORM is disabled. Idempotent.
 * Prefer {@link ensureProcessWormHostBootedEffect} for Effect callers.
 */
export function ensureProcessWormHostBootedEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void> {
  return Effect.gen(function* () {
    if (booted) return;
    booted = true;
    const svc = yield* bootProcessWormFromEnvEffect(env).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    if (!svc) return;
    memoryUnsub = registerMemoryWormSink(createMemoryWormSink());
    if (env.CLAWQL_WORM_DEBUG?.trim() === "1") {
      process.stderr.write("[clawql] process WORM trail ready (clawql-audit)\n");
    }
  });
}

/** Promise façade for MCP/HTTP process start. */
export async function ensureProcessWormHostBooted(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  return Effect.runPromise(ensureProcessWormHostBootedEffect(env));
}

/** AuthEventSink for createAuth({ authEventSink }) — no-ops until trail is booted. */
export function getProcessWormAuthEventSink() {
  return createAuthEventWormSink();
}

export function disposeProcessWormHostEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    memoryUnsub?.();
    memoryUnsub = undefined;
    booted = false;
    yield* stopProcessWormEffect();
  });
}

/** Promise façade for process shutdown. */
export async function disposeProcessWormHost(): Promise<void> {
  return Effect.runPromise(disposeProcessWormHostEffect());
}
