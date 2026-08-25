/**
 * Bridge {@link AuthEvent} emissions to the hash-chained auth WORM store.
 */

import { Effect } from "effect";

import type { AuthEventSink } from "./auth-events.js";
import { noopAuthEventSink } from "./auth-events.js";
import { AuthWormService, authWormLayerFromEnv, resolveAuthAuditStoreMode } from "./auth-worm.js";

let cachedSink: AuthEventSink | null = null;
let cachedSinkKey: string | null = null;

/**
 * Append-only sink backed by the configured auth audit store (SQLite default).
 * Returns {@link noopAuthEventSink} when `CLAWQL_AUTH_AUDIT_STORE=off`.
 *
 * Effect-primary: the returned sink yields an Effect (no Promise domain API).
 */
export function createAuthEventSinkFromEnv(env: NodeJS.ProcessEnv = process.env): AuthEventSink {
  const mode = resolveAuthAuditStoreMode(env);
  const key = `${mode}:${env.CLAWQL_AUTH_AUDIT_PATH ?? ""}:${env.CLAWQL_HOME ?? ""}`;
  if (cachedSink && cachedSinkKey === key) return cachedSink;

  if (mode === "off") {
    cachedSink = noopAuthEventSink;
    cachedSinkKey = key;
    return cachedSink;
  }

  const layer = authWormLayerFromEnv(env);
  const sink: AuthEventSink = (event) =>
    Effect.gen(function* () {
      const worm = yield* AuthWormService;
      yield* worm.append(event);
    }).pipe(Effect.provide(layer));
  cachedSink = sink;
  cachedSinkKey = key;
  return sink;
}

/** Clear cached sink singleton (tests). */
export function resetAuthEventSinkCacheForTests(): void {
  cachedSink = null;
  cachedSinkKey = null;
}
