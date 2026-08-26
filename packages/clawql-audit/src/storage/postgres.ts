/**
 * Postgres local backend (production). `pg` is an optionalDependency.
 */

import { createRequire } from "node:module";
import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import type { MerkleRoot } from "../merkle.js";
import type { LocalStorageBackend } from "./types.js";

type PgPoolClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
};

type PgPool = {
  connect: () => Promise<PgPoolClient>;
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  end: () => Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string; max?: number }) => PgPool;
};

function loadPg(): PgModule {
  const req = createRequire(import.meta.url);
  try {
    return req("pg") as PgModule;
  } catch (cause) {
    throw new Error(
      "PostgresBackend requires optional dependency `pg`. Install with: npm install pg",
      { cause }
    );
  }
}

const DDL = `
CREATE TABLE IF NOT EXISTS worm_entries (
  id TEXT PRIMARY KEY,
  chain_index BIGINT UNIQUE NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  prev_hash TEXT NOT NULL,
  written_at TIMESTAMPTZ NOT NULL,
  entry_json JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS worm_outbox (
  id TEXT PRIMARY KEY,
  entry_json JSONB NOT NULL,
  enqueued_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS worm_merkle_roots (
  root_hex TEXT NOT NULL,
  from_chain_index BIGINT NOT NULL,
  to_chain_index BIGINT NOT NULL,
  entry_count INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (from_chain_index, to_chain_index)
);
CREATE INDEX IF NOT EXISTS idx_worm_session ON worm_entries ((entry_json->>'sessionId'));
CREATE INDEX IF NOT EXISTS idx_worm_type ON worm_entries ((entry_json->>'type'));
CREATE INDEX IF NOT EXISTS idx_worm_timestamp ON worm_entries ((entry_json->>'timestamp'));
`;

export type PostgresBackendOptions = {
  connectionString: string;
  max?: number;
};

export class PostgresBackend implements LocalStorageBackend {
  private readonly pool: PgPool;
  private schemaReady = false;

  constructor(options: PostgresBackendOptions) {
    const pg = loadPg();
    this.pool = new pg.Pool({
      connectionString: options.connectionString,
      max: options.max ?? 4,
    });
  }

  private ensureSchema(): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    const ready = () => this.schemaReady;
    const markReady = () => {
      this.schemaReady = true;
    };
    return Effect.tryPromise({
      try: async () => {
        if (ready()) return;
        await pool.query(DDL);
        markReady();
      },
      catch: (cause) =>
        new AuditError({ reason: "Postgres schema init failed", cause }),
    });
  }

  write(entry: WORMEntry): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      yield* Effect.tryPromise({
        try: () =>
          pool.query(
            `INSERT INTO worm_entries
              (id, chain_index, hash, prev_hash, written_at, entry_json)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
              entry.id,
              entry.chainIndex,
              entry.hash,
              entry.prevHash,
              entry.writtenAt,
              JSON.stringify(entry),
            ]
          ),
        catch: (cause) =>
          new AuditError({ reason: "Postgres write failed", cause }),
      });
    });
  }

  writeWithOutbox(entry: WORMEntry): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      yield* Effect.tryPromise({
        try: async () => {
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query(
              `INSERT INTO worm_entries
                (id, chain_index, hash, prev_hash, written_at, entry_json)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
              [
                entry.id,
                entry.chainIndex,
                entry.hash,
                entry.prevHash,
                entry.writtenAt,
                JSON.stringify(entry),
              ]
            );
            await client.query(
              `INSERT INTO worm_outbox (id, entry_json, enqueued_at) VALUES ($1, $2::jsonb, $3)`,
              [entry.id, JSON.stringify(entry), new Date().toISOString()]
            );
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        },
        catch: (cause) =>
          new AuditError({ reason: "Postgres writeWithOutbox failed", cause }),
      });
    });
  }

  outboxList(): Effect.Effect<WORMEntry[], AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      return yield* Effect.tryPromise({
        try: async () => {
          const res = await pool.query(
            `SELECT entry_json FROM worm_outbox ORDER BY enqueued_at ASC`
          );
          return res.rows.map((r) => (r as { entry_json: WORMEntry }).entry_json);
        },
        catch: (cause) =>
          new AuditError({ reason: "Postgres outboxList failed", cause }),
      });
    });
  }

  outboxDelete(id: string): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      yield* Effect.tryPromise({
        try: () => pool.query(`DELETE FROM worm_outbox WHERE id = $1`, [id]),
        catch: (cause) =>
          new AuditError({ reason: "Postgres outboxDelete failed", cause }),
      });
    });
  }

  storeMerkleRoot(root: MerkleRoot): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      yield* Effect.tryPromise({
        try: () =>
          pool.query(
            `INSERT INTO worm_merkle_roots
              (root_hex, from_chain_index, to_chain_index, entry_count, computed_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (from_chain_index, to_chain_index) DO UPDATE SET
               root_hex = EXCLUDED.root_hex,
               entry_count = EXCLUDED.entry_count,
               computed_at = EXCLUDED.computed_at`,
            [
              root.rootHex,
              root.fromChainIndex,
              root.toChainIndex,
              root.entryCount,
              root.computedAt,
            ]
          ),
        catch: (cause) =>
          new AuditError({ reason: "Postgres storeMerkleRoot failed", cause }),
      });
    });
  }

  listMerkleRoots(): Effect.Effect<MerkleRoot[], AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      return yield* Effect.tryPromise({
        try: async () => {
          const res = await pool.query(
            `SELECT root_hex, from_chain_index, to_chain_index, entry_count, computed_at
             FROM worm_merkle_roots ORDER BY from_chain_index ASC`
          );
          return res.rows.map((r) => {
            const row = r as {
              root_hex: string;
              from_chain_index: string | number;
              to_chain_index: string | number;
              entry_count: number;
              computed_at: Date | string;
            };
            return {
              rootHex: row.root_hex,
              fromChainIndex: Number(row.from_chain_index),
              toChainIndex: Number(row.to_chain_index),
              entryCount: Number(row.entry_count),
              computedAt:
                typeof row.computed_at === "string"
                  ? row.computed_at
                  : row.computed_at.toISOString(),
            };
          });
        },
        catch: (cause) =>
          new AuditError({ reason: "Postgres listMerkleRoots failed", cause }),
      });
    });
  }

  query(filter: WORMFilter): Effect.Effect<WORMEntry[], AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      return yield* Effect.tryPromise({
        try: async () => {
          const conditions: string[] = [];
          const params: unknown[] = [];
          const push = (clause: string, value: unknown) => {
            params.push(value);
            conditions.push(clause.replace("?", `$${params.length}`));
          };
          if (filter.sessionId) push(`entry_json->>'sessionId' = ?`, filter.sessionId);
          if (filter.type) push(`entry_json->>'type' = ?`, filter.type);
          if (filter.agentName) push(`entry_json->>'agentName' = ?`, filter.agentName);
          if (filter.since) push(`entry_json->>'timestamp' >= ?`, filter.since);
          if (filter.until) push(`entry_json->>'timestamp' <= ?`, filter.until);
          const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
          let sql = `SELECT entry_json FROM worm_entries ${where} ORDER BY chain_index ASC`;
          if (filter.limit !== undefined) {
            sql += ` LIMIT ${Number(filter.limit)}`;
            if (filter.offset !== undefined) sql += ` OFFSET ${Number(filter.offset)}`;
          } else if (filter.offset !== undefined) {
            sql += ` OFFSET ${Number(filter.offset)}`;
          }
          const res = await pool.query(sql, params);
          return res.rows.map((r) => (r as { entry_json: WORMEntry }).entry_json);
        },
        catch: (cause) =>
          new AuditError({ reason: "Postgres query failed", cause }),
      });
    });
  }

  all(): Effect.Effect<WORMEntry[], AuditError> {
    return this.query({});
  }

  latestEntry(): Effect.Effect<WORMEntry | null, AuditError> {
    const pool = this.pool;
    const ensure = this.ensureSchema();
    return Effect.gen(function* () {
      yield* ensure;
      return yield* Effect.tryPromise({
        try: async () => {
          const res = await pool.query(
            `SELECT entry_json FROM worm_entries ORDER BY chain_index DESC LIMIT 1`
          );
          if (!res.rows[0]) return null;
          return (res.rows[0] as { entry_json: WORMEntry }).entry_json;
        },
        catch: (cause) =>
          new AuditError({ reason: "Postgres latestEntry failed", cause }),
      });
    });
  }

  close(): Effect.Effect<void, AuditError> {
    const pool = this.pool;
    return Effect.tryPromise({
      try: () => pool.end(),
      catch: (cause) =>
        new AuditError({ reason: "Postgres pool end failed", cause }),
    });
  }
}
