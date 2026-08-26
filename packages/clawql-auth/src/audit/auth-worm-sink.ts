/**
 * Bridge {@link AuthEvent} emissions to the hash-chained auth WORM store.
 * When `CLAWQL_WORM_ENABLED=1`, also best-effort dual-writes to the process
 * trail via optional `clawql-audit` (dynamic import — no hard dependency).
 */

import { Effect } from "effect";

import type { AuthEvent, AuthEventSink } from "./auth-events.js";
import { noopAuthEventSink } from "./auth-events.js";
import { AuthWormService, authWormLayerFromEnv, resolveAuthAuditStoreMode } from "./auth-worm.js";

let cachedSink: AuthEventSink | null = null;
let cachedSinkKey: string | null = null;

function processWormEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.CLAWQL_WORM_ENABLED?.trim() === "1";
}

/** Best-effort dual-write to clawql-audit process trail. */
function appendProcessWormBestEffort(event: AuthEvent): Effect.Effect<void> {
  return Effect.tryPromise({
    try: async () => {
      const audit = await import("clawql-audit");
      await Effect.runPromise(audit.appendAuthEventToWormEffect(event));
    },
    catch: () => undefined,
  }).pipe(Effect.ignore);
}

function composeSink(primary: AuthEventSink, env: NodeJS.ProcessEnv): AuthEventSink {
  if (!processWormEnabled(env)) return primary;
  return (event) =>
    Effect.gen(function* () {
      yield* primary(event);
      yield* appendProcessWormBestEffort(event);
    });
}

/**
 * Append-only sink backed by the configured auth audit store (SQLite default).
 * Returns {@link noopAuthEventSink} when `CLAWQL_AUTH_AUDIT_STORE=off`.
 *
 * Effect-primary: the returned sink yields an Effect (no Promise domain API).
 */
export function createAuthEventSinkFromEnv(env: NodeJS.ProcessEnv = process.env): AuthEventSink {
  const mode = resolveAuthAuditStoreMode(env);
  const worm = processWormEnabled(env) ? "1" : "0";
  const key = `${mode}:${worm}:${env.CLAWQL_AUTH_AUDIT_PATH ?? ""}:${env.CLAWQL_HOME ?? ""}`;
  if (cachedSink && cachedSinkKey === key) return cachedSink;

  if (mode === "off") {
    cachedSink = composeSink(noopAuthEventSink, env);
    cachedSinkKey = key;
    return cachedSink;
  }

  const layer = authWormLayerFromEnv(env);
  const sqliteSink: AuthEventSink = (event) =>
    Effect.gen(function* () {
      const worm = yield* AuthWormService;
      yield* worm.append(event);
    }).pipe(Effect.provide(layer));
  cachedSink = composeSink(sqliteSink, env);
  cachedSinkKey = key;
  return cachedSink;
}

/** Clear cached sink singleton (tests). */
export function resetAuthEventSinkCacheForTests(): void {
  cachedSink = null;
  cachedSinkKey = null;
}
