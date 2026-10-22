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
import { createRequire } from "node:module";
import { Effect } from "effect";

const requireFromHere = createRequire(import.meta.url);

let memoryUnsub: (() => void) | undefined;
let booted = false;

/**
 * Best-effort boot. Safe when WORM is disabled. Idempotent.
 * Prefer {@link ensureProcessWormHostBootedEffect} for Effect callers.
 *
 * Loads `clawql-memory/okf` only when the trail actually boots — keep slim
 * listen (memory=off, WORM off) off the embedding / ONNX graph.
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
    try {
      const { registerMemoryWormSink } = requireFromHere(
        "clawql-memory/okf"
      ) as typeof import("clawql-memory/okf");
      memoryUnsub = registerMemoryWormSink(createMemoryWormSink());
    } catch {
      /* memory package optional */
    }
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
