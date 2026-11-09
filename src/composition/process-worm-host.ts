/**
 * Boot process clawql-audit WORM + register host sinks (memory; auth sink exported).
 * Call once at MCP/HTTP process start when CLAWQL_WORM_ENABLED=1.
 *
 * `clawql-audit` is dynamic-imported so WORM-off Ready (equal-arm) never evaluates
 * cbor/qrcode/raptorq/S3.
 */

import { createRequire } from "node:module";
import { Effect } from "effect";

const requireFromHere = createRequire(import.meta.url);

type ClawqlAudit = typeof import("clawql-audit");

let memoryUnsub: (() => void) | undefined;
let booted = false;
let auditMod: ClawqlAudit | null = null;

async function loadAudit(): Promise<ClawqlAudit> {
  if (auditMod) return auditMod;
  auditMod = await import("clawql-audit");
  return auditMod;
}

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
    if (env.CLAWQL_WORM_ENABLED?.trim() !== "1") return;
    const audit = yield* Effect.promise(() => loadAudit());
    const svc = yield* audit
      .bootProcessWormFromEnvEffect(env)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!svc) return;
    try {
      const { registerMemoryWormSink } = requireFromHere(
        "clawql-memory/okf"
      ) as typeof import("clawql-memory/okf");
      memoryUnsub = registerMemoryWormSink(audit.createMemoryWormSink());
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
export async function getProcessWormAuthEventSink() {
  const audit = await loadAudit();
  return audit.createAuthEventWormSink();
}

export function disposeProcessWormHostEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    memoryUnsub?.();
    memoryUnsub = undefined;
    booted = false;
    if (!auditMod) return;
    yield* auditMod.stopProcessWormEffect();
  });
}

/** Promise façade for process shutdown. */
export async function disposeProcessWormHost(): Promise<void> {
  return Effect.runPromise(disposeProcessWormHostEffect());
}
