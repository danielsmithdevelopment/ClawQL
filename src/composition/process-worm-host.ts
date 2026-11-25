/**
 * Boot process clawql-audit WORM + register host sinks (memory; auth sink exported).
 * Call once at MCP/HTTP process start. Hash-chained local WORM is on by default;
 * set `CLAWQL_WORM_ENABLED=0` to disable.
 *
 * `clawql-audit` is dynamic-imported so WORM-off Ready (equal-arm) never evaluates
 * cbor/qrcode/raptorq/S3.
 */

function wormEnabledFromEnvSync(env: NodeJS.ProcessEnv): boolean {
  const raw = env.CLAWQL_WORM_ENABLED?.trim().toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

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
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    if (booted) return;
    if (!wormEnabledFromEnvSync(env)) {
      process.stderr.write(
        "[clawql] WARNING: process WORM disabled (CLAWQL_WORM_ENABLED=0). " +
          "Hash-chained audit trail is off for this process.\n"
      );
      const tier = env.CLAWQL_TIER?.trim().toLowerCase();
      if (tier === "regulated") {
        // Do not set `booted` — operator can fix env and retry.
        return yield* Effect.fail(
          new Error(
            "CLAWQL_TIER=regulated refuses to start with WORM disabled. " +
              "Unset CLAWQL_WORM_ENABLED=0 or leave the regulated profile."
          )
        );
      }
      booted = true;
      return;
    }
    const audit = yield* Effect.promise(() => loadAudit());
    const svc = yield* audit.bootProcessWormFromEnvEffect(env).pipe(
      Effect.mapError((err) => {
        const reason =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "reason" in err
              ? String((err as { reason: unknown }).reason)
              : String(err);
        return new Error(reason);
      })
    );
    if (!svc) {
      if (tierIsRegulated(env)) {
        return yield* Effect.fail(
          new Error(
            "CLAWQL_TIER=regulated requires a durable process WORM trail. " +
              "Check CLAWQL_WORM_* backends (sqlite/postgres local; s3 remote)."
          )
        );
      }
      booted = true;
      return;
    }
    const status = audit.getProcessWormBackendStatus() ?? null;
    if (tierIsRegulated(env) && status && (!status.localDurable || status.remote === "memory")) {
      yield* audit.stopProcessWormEffect().pipe(Effect.catch(() => Effect.void));
      return yield* Effect.fail(
        new Error(
          "CLAWQL_TIER=regulated refuses non-durable WORM backends " +
            `(local=${status.local}, remote=${status.remote}).`
        )
      );
    }
    try {
      const { registerMemoryWormSink } = requireFromHere(
        "clawql-memory/okf"
      ) as typeof import("clawql-memory/okf");
      memoryUnsub = registerMemoryWormSink(audit.createMemoryWormSink());
    } catch {
      /* memory package optional */
    }
    booted = true;
    if (status) {
      process.stderr.write(
        `[clawql] process WORM ready local=${status.local} remote=${status.remote}\n`
      );
    } else if (env.CLAWQL_WORM_DEBUG?.trim() === "1") {
      process.stderr.write("[clawql] process WORM trail ready (clawql-audit)\n");
    }
  });
}

function tierIsRegulated(env: NodeJS.ProcessEnv): boolean {
  return env.CLAWQL_TIER?.trim().toLowerCase() === "regulated";
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
