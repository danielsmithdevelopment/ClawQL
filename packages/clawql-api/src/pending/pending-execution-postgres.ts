/**
 * Shared-store pending executions (Postgres).
 *
 * Consume is one conditional UPDATE using the database clock (`NOW()`):
 * safe across gateway replicas. Managed multi-node must use this backend.
 *
 * Env: CLAWQL_PENDING_DATABASE_URL
 */

import { createRequire } from "node:module";
import { Effect } from "effect";
import type { PendingExecutionRecord, PendingExecutionStatus } from "./pending-execution-types.js";

type PgPoolClient = {
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  release: () => void;
};

type PgPool = {
  connect: () => Promise<PgPoolClient>;
  query: (
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
  end: () => Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string; max?: number }) => PgPool;
};

/** Same predicate shape as SQLite / the TLA+ Consume action. */
export const POSTGRES_CONSUME_SQL = `
UPDATE pending_executions
SET status = 'outcome_unknown',
    consumed_at = CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END,
    consumed_by = $1,
    last_error = NULL,
    updated_at = CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END
WHERE execution_id = $2
  AND status = 'approved'
  AND args_hash = $3
  AND expires_at > CASE WHEN $4::timestamptz IS NULL THEN NOW() ELSE $4::timestamptz END
RETURNING execution_id, payload_json, consumed_at, consumed_by
`.trim();

const DDL = `
CREATE TABLE IF NOT EXISTS pending_executions (
  execution_id TEXT PRIMARY KEY,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_exec_status ON pending_executions(status);
`;

let pool: PgPool | null = null;
let schemaReady = false;

function loadPg(): PgModule {
  const req = createRequire(import.meta.url);
  try {
    return req("pg") as PgModule;
  } catch (cause) {
    throw new Error(
      "Pending Postgres store requires dependency `pg`. Install with: npm install pg",
      { cause }
    );
  }
}

export function pendingDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env.CLAWQL_PENDING_DATABASE_URL?.trim();
  return url || null;
}

function getPool(env: NodeJS.ProcessEnv = process.env): PgPool {
  const url = pendingDatabaseUrl(env);
  if (!url) {
    throw new Error(
      "CLAWQL_PENDING_STORE=postgres (or managed multi-node) requires CLAWQL_PENDING_DATABASE_URL"
    );
  }
  if (!pool) {
    const pg = loadPg();
    pool = new pg.Pool({ connectionString: url, max: 8 });
  }
  return pool;
}

export async function resetPendingPostgresPoolForTests(): Promise<void> {
  if (pool) {
    await pool.end().catch(() => undefined);
    pool = null;
    schemaReady = false;
  }
}

async function ensureSchema(env: NodeJS.ProcessEnv = process.env): Promise<PgPool> {
  const p = getPool(env);
  if (!schemaReady) {
    await p.query(DDL);
    schemaReady = true;
  }
  return p;
}

function rowToRecord(payload: unknown): PendingExecutionRecord {
  const raw =
    typeof payload === "string"
      ? (JSON.parse(payload) as PendingExecutionRecord)
      : (payload as PendingExecutionRecord);
  return {
    ...raw,
    where: raw.where ?? null,
    consumedAt: raw.consumedAt ?? null,
    consumedBy: raw.consumedBy ?? null,
    idempotencyCapable: raw.idempotencyCapable ?? false,
  };
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return new Date().toISOString();
}

export const readPendingPostgresEffect = (
  executionId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const p = await ensureSchema(env);
      const r = await p.query(
        `SELECT payload_json FROM pending_executions WHERE execution_id = $1`,
        [executionId]
      );
      if (!r.rows[0]) return null;
      return rowToRecord((r.rows[0] as { payload_json: unknown }).payload_json);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const writePendingPostgresEffect = (
  record: PendingExecutionRecord,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const p = await ensureSchema(env);
      const expiresAt = record.expiresAt;
      await p.query(
        `
        INSERT INTO pending_executions (
          execution_id, payload_json, status, args_hash, expires_at,
          consumed_at, consumed_by, last_error, updated_at
        ) VALUES ($1, $2::jsonb, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, NOW())
        ON CONFLICT (execution_id) DO UPDATE SET
          payload_json = EXCLUDED.payload_json,
          status = EXCLUDED.status,
          args_hash = EXCLUDED.args_hash,
          expires_at = EXCLUDED.expires_at,
          consumed_at = EXCLUDED.consumed_at,
          consumed_by = EXCLUDED.consumed_by,
          last_error = EXCLUDED.last_error,
          updated_at = NOW()
      `,
        [
          record.executionId,
          JSON.stringify(record),
          record.status,
          record.argsHash,
          expiresAt,
          record.consumedAt,
          record.consumedBy,
          record.lastError,
        ]
      );
      return `postgres:pending_executions/${record.executionId}`;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const updatePendingPostgresStatusEffect = (
  executionId: string,
  patch: {
    readonly status: PendingExecutionStatus;
    readonly approvedAt?: string | null;
    readonly completedAt?: string | null;
    readonly lastError?: string | null;
    readonly consumedAt?: string | null;
    readonly consumedBy?: string | null;
  },
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingExecutionRecord, Error> =>
  Effect.gen(function* () {
    const existing = yield* readPendingPostgresEffect(executionId, env);
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
    yield* writePendingPostgresEffect(next, env);
    return next;
  });

export type TryConsumeApprovedInput = {
  readonly argsHash: string;
  readonly consumedBy?: string;
  /** Test override only — production uses DB NOW(). */
  readonly nowMs?: number;
};

export const tryConsumeApprovedPostgresEffect = (
  executionId: string,
  input: TryConsumeApprovedInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<PendingExecutionRecord | null, Error> =>
  Effect.tryPromise({
    try: async () => {
      const p = await ensureSchema(env);
      const client = await p.connect();
      const consumedBy = input.consumedBy?.trim() || `pid:${process.pid}`;
      const nowParam = input.nowMs !== undefined ? new Date(input.nowMs).toISOString() : null;
      try {
        await client.query("BEGIN");
        const r = await client.query(POSTGRES_CONSUME_SQL, [
          consumedBy,
          executionId,
          input.argsHash,
          nowParam,
        ]);
        if (!r.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        const row = r.rows[0] as {
          payload_json: unknown;
          consumed_at: unknown;
          consumed_by: unknown;
        };
        const existing = rowToRecord(row.payload_json);
        const next: PendingExecutionRecord = {
          ...existing,
          status: "outcome_unknown",
          consumedAt: toIso(row.consumed_at),
          consumedBy: String(row.consumed_by ?? consumedBy),
          lastError: null,
        };
        await client.query(
          `UPDATE pending_executions SET payload_json = $1::jsonb WHERE execution_id = $2`,
          [JSON.stringify(next), executionId]
        );
        await client.query("COMMIT");
        return next;
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const listPendingPostgresIdsEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<readonly string[], Error> =>
  Effect.tryPromise({
    try: async () => {
      const p = await ensureSchema(env);
      const r = await p.query(`SELECT execution_id FROM pending_executions ORDER BY execution_id`);
      return r.rows.map((row) => (row as { execution_id: string }).execution_id);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

export const deletePendingPostgresEffect = (
  executionId: string,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const p = await ensureSchema(env);
      await p.query(`DELETE FROM pending_executions WHERE execution_id = $1`, [executionId]);
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
