/**
 * In-memory session label accumulator for execute-path IFC (ADR 0015).
 *
 * **Session key** (documented for operators / Lean differential):
 * Prefer explicit `sessionId` argument, then `CLAWQL_SESSION_ID`, then
 * `CLAWQL_API_KEY_ID`, else `"default"`. Do not derive a partition from the
 * raw `CLAWQL_API_KEY` secret (hosts should set session id or key id).
 * This matches “one MCP session per API key / connection” when the host binds
 * `CLAWQL_SESSION_ID` (or key id) for the connection.
 *
 * **Within-session only (ADR 0015):** labels do not cross this key. A client can
 * still carry data from one session into another in its own context; ClawQL
 * cannot see that. Do not claim cross-session IFC from this store alone.
 */

import { Context, Effect, Layer } from "effect";
import {
  mergeSessionLabelsBounded,
  SESSION_IFC_MAX_FINE_SOURCE_LABELS,
  type Label,
} from "./labels.js";

/** Process-global map: sessionKey → accumulated label set. */
const globalSessionLabels = new Map<string, Set<Label>>();

export function resolveSessionLabelKey(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const explicit = sessionId?.trim();
  if (explicit) return explicit;
  const fromEnv = env.CLAWQL_SESSION_ID?.trim();
  if (fromEnv) return fromEnv;
  const keyId = env.CLAWQL_API_KEY_ID?.trim();
  if (keyId) return `apikey:${keyId}`;
  return "default";
}

/** Resolve fine-label cap from env (default {@link SESSION_IFC_MAX_FINE_SOURCE_LABELS}). */
export function resolveSessionIfcMaxFineLabels(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = Number(env.CLAWQL_SESSION_IFC_MAX_FINE_LABELS?.trim());
  if (Number.isFinite(raw) && raw > 0) return Math.min(Math.floor(raw), 10_000);
  return SESSION_IFC_MAX_FINE_SOURCE_LABELS;
}

export type SessionLabelStoreApi = {
  readonly get: (sessionKey: string) => Effect.Effect<ReadonlySet<Label>>;
  readonly accumulate: (
    sessionKey: string,
    labels: readonly Label[]
  ) => Effect.Effect<ReadonlySet<Label>>;
  readonly clear: (sessionKey: string) => Effect.Effect<void>;
  /** Test helper — wipe all sessions. */
  readonly clearAll: () => Effect.Effect<void>;
};

function makeStore(
  map: Map<string, Set<Label>>,
  maxFine: () => number = () => resolveSessionIfcMaxFineLabels()
): SessionLabelStoreApi {
  return {
    get: (sessionKey) =>
      Effect.sync(() => {
        const set = map.get(sessionKey);
        return set ? new Set(set) : new Set<Label>();
      }),
    accumulate: (sessionKey, labels) =>
      Effect.sync(() => {
        const prev = map.get(sessionKey) ?? new Set<Label>();
        // Safe cardinality bound — never drop untrusted/poison marks (merge toward broader).
        const merged = mergeSessionLabelsBounded(prev, labels, maxFine());
        map.set(sessionKey, merged);
        return new Set(merged);
      }),
    clear: (sessionKey) =>
      Effect.sync(() => {
        map.delete(sessionKey);
      }),
    clearAll: () =>
      Effect.sync(() => {
        map.clear();
      }),
  };
}

export class SessionLabelStore extends Context.Service<SessionLabelStore, SessionLabelStoreApi>()(
  "clawql/SessionLabelStore"
) {}

/** Live store backed by the process-global Map (MCP process lifetime). */
export const SessionLabelStoreLive = Layer.succeed(
  SessionLabelStore,
  SessionLabelStore.of(makeStore(globalSessionLabels))
);

/** Fresh in-memory store for unit tests (isolated Map). */
export const makeSessionLabelStoreLayer = (
  map: Map<string, Set<Label>> = new Map(),
  maxFine: () => number = () => resolveSessionIfcMaxFineLabels()
): Layer.Layer<SessionLabelStore> =>
  Layer.succeed(SessionLabelStore, SessionLabelStore.of(makeStore(map, maxFine)));

/** Sync façades for execute-core host boundary. */
export function getSessionLabelsSync(sessionKey: string): ReadonlySet<Label> {
  return Effect.runSync(
    Effect.gen(function* () {
      const store = yield* SessionLabelStore;
      return yield* store.get(sessionKey);
    }).pipe(Effect.provide(SessionLabelStoreLive))
  );
}

export function accumulateSessionLabelsSync(
  sessionKey: string,
  labels: readonly Label[]
): ReadonlySet<Label> {
  return Effect.runSync(
    Effect.gen(function* () {
      const store = yield* SessionLabelStore;
      return yield* store.accumulate(sessionKey, labels);
    }).pipe(Effect.provide(SessionLabelStoreLive))
  );
}

export function clearAllSessionLabelsSync(): void {
  Effect.runSync(
    Effect.gen(function* () {
      const store = yield* SessionLabelStore;
      yield* store.clearAll();
    }).pipe(Effect.provide(SessionLabelStoreLive))
  );
}
