/**
 * Shared-store pending executions (SQLite).
 *
 * Consume is one SQL statement — safe across gateway processes that share the DB file.
 * Multi-node managed still needs Postgres with the same predicate (documented in ADR 0014).
 *
 * `node:sqlite` is loaded lazily via createRequire so tsup/esbuild does not rewrite a
 * static `import … from "node:sqlite"` into a bare `sqlite` specifier that breaks
 * Docker/webpack consumers (same pattern as clawql-auth / clawql-audit).
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { Effect } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import type { PendingExecutionRecord, PendingExecutionStatus } from "./pending-execution-types.js";

const DIR_MODE = 0o700;

type DatabaseSyncInstance = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type DatabaseSyncCtor = new (path: string) => DatabaseSyncInstance;

function loadDatabaseSync(): DatabaseSyncCtor {
  // Prefer node: protocol; fall back for runtimes that strip the prefix.
  try {
    const req = createRequire(import.meta.url);
    const mod = req("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };
    return mod.DatabaseSync;
  } catch {
    const req = createRequire(import.meta.url);
    const mod = req("sqlite") as { DatabaseSync: DatabaseSyncCtor };
    return mod.DatabaseSync;
  }
}

/** Single conditional consume — zero rows ⇒ refuse. Uses DB `unixepoch('now')*1000` when nowMs omitted. */
export const CONSUME_SQL = `
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = ?,
    consumed_by = ?,
    last_error = NULL,
    updated_at = ?
WHERE execution_id = ?
  AND status = 'approved'
  AND args_hash = ?
  AND expires_at_ms > ?
RETURNING execution_id
`.trim();

let cached: { home: string; db: DatabaseSyncInstance } | null = null;

export function pendingSqlitePath(home = resolveClawqlHome()): string {
  return join(home, "pending-executions.sqlite");
}

function openDb(home: string): DatabaseSyncInstance {
  if (cached?.home === home) return cached.db;
  mkdirSync(home, { recursive: true, mode: DIR_MODE });
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(pendingSqlitePath(home));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS pending_executions (
      execution_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      args_hash TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      consumed_at TEXT,
      consumed_by TEXT,
      last_error TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_executions(status);
  `);
  cached = { home, db };
  return db;
}

/** Test helper — close cached handle so a new home can open. */
export function resetPendingSqliteCacheForTests(): void {
  if (cached) {
    try {
      cached.db.close();
    } catch {
      /* ignore */
    }
    cached = null;
  }
}

function rowToRecord(payloadJson: string): PendingExecutionRecord {
  const raw = JSON.parse(payloadJson) as PendingExecutionRecord;
  return {
    ...raw,
    where: raw.where ?? null,
    consumedAt: raw.consumedAt ?? null,
    consumedBy: raw.consumedBy ?? null,
    idempotencyCapable: raw.idempotencyCapable ?? false,
  };
}

function upsertRecord(db: DatabaseSyncInstance, record: PendingExecutionRecord): void {
  const expiresAtMs = Date.parse(record.expiresAt);
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify(record);
  db.prepare(
    `
    INSERT INTO pending_executions (
      execution_id, payload_json, status, args_hash, expires_at_ms,
      consumed_at, consumed_by, last_error, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(execution_id) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = excluded.status,
      args_hash = excluded.args_hash,
      expires_at_ms = excluded.expires_at_ms,
      consumed_at = excluded.consumed_at,
      consumed_by = excluded.consumed_by,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `
  ).run(
    record.executionId,
    payload,
    record.status,
    record.argsHash,
    Number.isFinite(expiresAtMs) ? expiresAtMs : 0,
    record.consumedAt,
    record.consumedBy,
    record.lastError,
    updatedAt
  );
}

export const readPendingSqliteEffect = (
  executionId: string,
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.try({
    try: () => {
      const db = openDb(home);
      const row = db
        .prepare(`SELECT payload_json FROM pending_executions WHERE execution_id = ?`)
        .get(executionId) as { payload_json: string } | undefined;
      return row ? rowToRecord(row.payload_json) : null;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const writePendingSqliteEffect = (
  record: PendingExecutionRecord,
  home = resolveClawqlHome()
): Effect.Effect<string, Error> =>
  Effect.try({
    try: () => {
      const db = openDb(home);
      upsertRecord(db, record);
      return pendingSqlitePath(home);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const updatePendingSqliteStatusEffect = (
  executionId: string,
  patch: {
    readonly status: PendingExecutionStatus;
    readonly approvedAt?: string | null;
    readonly completedAt?: string | null;
    readonly lastError?: string | null;
    readonly consumedAt?: string | null;
    readonly consumedBy?: string | null;
  },
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord, Error> =>
  Effect.gen(function* () {
    const existing = yield* readPendingSqliteEffect(executionId, home);
    if (!existing) {
      return yield* Effect.fail(new Error(`Unknown executionId: ${executionId}`));
    }
    const next: PendingExecutionRecord = {
      ...existing,
      status: patch.status,
      approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : existing.approvedAt,
      completedAt: patch.completedAt !== undefined ? patch.completedAt : existing.completedAt,
      lastError: patch.lastError !== undefined ? patch.lastError : existing.lastError,
      consumedAt: patch.consumedAt !== undefined ? patch.consumedAt : existing.consumedAt,
      consumedBy: patch.consumedBy !== undefined ? patch.consumedBy : existing.consumedBy,
    };
    yield* writePendingSqliteEffect(next, home);
    return next;
  });

export type TryConsumeApprovedInput = {
  readonly argsHash: string;
  readonly consumedBy?: string;
  readonly nowMs?: number;
};

export const tryConsumeApprovedSqliteEffect = (
  executionId: string,
  input: TryConsumeApprovedInput,
  home = resolveClawqlHome()
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.try({
    try: () => {
      const db = openDb(home);
      const nowMs = input.nowMs ?? Date.now();
      const consumedAt = new Date(nowMs).toISOString();
      const consumedBy = input.consumedBy?.trim() || `pid:${process.pid}`;
      db.exec("BEGIN IMMEDIATE");
      try {
        const hit = db
          .prepare(CONSUME_SQL)
          .get(consumedAt, consumedBy, consumedAt, executionId, input.argsHash, nowMs) as
          { execution_id: string } | undefined;
        if (!hit) {
          db.exec("ROLLBACK");
          return null;
        }
        const row = db
          .prepare(`SELECT payload_json FROM pending_executions WHERE execution_id = ?`)
          .get(executionId) as { payload_json: string };
        const existing = rowToRecord(row.payload_json);
        const next: PendingExecutionRecord = {
          ...existing,
          status: "outcome_unknown",
          consumedAt,
          consumedBy,
          lastError: null,
        };
        db.prepare(
          `UPDATE pending_executions SET payload_json = ?, updated_at = ? WHERE execution_id = ?`
        ).run(JSON.stringify(next), consumedAt, executionId);
        db.exec("COMMIT");
        return next;
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listPendingSqliteIdsEffect = (
  home = resolveClawqlHome()
): Effect.Effect<readonly string[], Error> =>
  Effect.try({
    try: () => {
      const db = openDb(home);
      const rows = db
        .prepare(`SELECT execution_id FROM pending_executions ORDER BY execution_id`)
        .all() as { execution_id: string }[];
      return rows.map((r) => r.execution_id);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const deletePendingSqliteEffect = (
  executionId: string,
  home = resolveClawqlHome()
): Effect.Effect<void, Error> =>
  Effect.try({
    try: () => {
      openDb(home)
        .prepare(`DELETE FROM pending_executions WHERE execution_id = ?`)
        .run(executionId);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
