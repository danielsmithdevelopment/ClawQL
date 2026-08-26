/**
 * SQLite local backend via Node built-in `node:sqlite` (no better-sqlite3 native addon).
 */

import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { AuditError } from "../errors.js";
import type { MerkleRoot } from "../merkle.js";
import type { LocalStorageBackend } from "./types.js";

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

export type SQLiteBackendOptions = {
  path: string;
};

export class SQLiteBackend implements LocalStorageBackend {
  private readonly db: DatabaseSyncInstance;

  constructor(options: SQLiteBackendOptions) {
    mkdirSync(dirname(options.path), { recursive: true });
    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(options.path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS worm_entries (
        id TEXT PRIMARY KEY,
        chain_index INTEGER UNIQUE NOT NULL,
        hash TEXT UNIQUE NOT NULL,
        prev_hash TEXT NOT NULL,
        written_at TEXT NOT NULL,
        entry_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worm_outbox (
        id TEXT PRIMARY KEY,
        entry_json TEXT NOT NULL,
        enqueued_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS worm_merkle_roots (
        root_hex TEXT NOT NULL,
        from_chain_index INTEGER NOT NULL,
        to_chain_index INTEGER NOT NULL,
        entry_count INTEGER NOT NULL,
        computed_at TEXT NOT NULL,
        PRIMARY KEY (from_chain_index, to_chain_index)
      );
      CREATE INDEX IF NOT EXISTS idx_session ON worm_entries
        ((json_extract(entry_json, '$.sessionId')));
      CREATE INDEX IF NOT EXISTS idx_type ON worm_entries
        ((json_extract(entry_json, '$.type')));
      CREATE INDEX IF NOT EXISTS idx_timestamp ON worm_entries
        ((json_extract(entry_json, '$.timestamp')));
    `);
  }

  write = (entry: WORMEntry): Effect.Effect<void, AuditError> =>
    Effect.try({
      try: () => {
        this.db
          .prepare(
            `INSERT INTO worm_entries
              (id, chain_index, hash, prev_hash, written_at, entry_json)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            entry.id,
            entry.chainIndex,
            entry.hash,
            entry.prevHash,
            entry.writtenAt,
            JSON.stringify(entry)
          );
      },
      catch: (cause) => new AuditError({ reason: "SQLite write failed", cause }),
    });

  writeWithOutbox = (entry: WORMEntry): Effect.Effect<void, AuditError> =>
    Effect.try({
      try: () => {
        this.db.exec("BEGIN");
        try {
          this.db
            .prepare(
              `INSERT INTO worm_entries
                (id, chain_index, hash, prev_hash, written_at, entry_json)
               VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
              entry.id,
              entry.chainIndex,
              entry.hash,
              entry.prevHash,
              entry.writtenAt,
              JSON.stringify(entry)
            );
          this.db
            .prepare(`INSERT INTO worm_outbox (id, entry_json, enqueued_at) VALUES (?, ?, ?)`)
            .run(entry.id, JSON.stringify(entry), new Date().toISOString());
          this.db.exec("COMMIT");
        } catch (err) {
          this.db.exec("ROLLBACK");
          throw err;
        }
      },
      catch: (cause) => new AuditError({ reason: "SQLite writeWithOutbox failed", cause }),
    });

  outboxList = (): Effect.Effect<WORMEntry[], AuditError> =>
    Effect.try({
      try: () => {
        const rows = this.db
          .prepare(`SELECT entry_json FROM worm_outbox ORDER BY enqueued_at ASC`)
          .all() as { entry_json: string }[];
        return rows.map((r) => JSON.parse(r.entry_json) as WORMEntry);
      },
      catch: (cause) => new AuditError({ reason: "SQLite outboxList failed", cause }),
    });

  outboxDelete = (id: string): Effect.Effect<void, AuditError> =>
    Effect.try({
      try: () => {
        this.db.prepare(`DELETE FROM worm_outbox WHERE id = ?`).run(id);
      },
      catch: (cause) => new AuditError({ reason: "SQLite outboxDelete failed", cause }),
    });

  storeMerkleRoot = (root: MerkleRoot): Effect.Effect<void, AuditError> =>
    Effect.try({
      try: () => {
        this.db
          .prepare(
            `INSERT OR REPLACE INTO worm_merkle_roots
              (root_hex, from_chain_index, to_chain_index, entry_count, computed_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            root.rootHex,
            root.fromChainIndex,
            root.toChainIndex,
            root.entryCount,
            root.computedAt
          );
      },
      catch: (cause) => new AuditError({ reason: "SQLite storeMerkleRoot failed", cause }),
    });

  listMerkleRoots = (): Effect.Effect<MerkleRoot[], AuditError> =>
    Effect.try({
      try: () => {
        const rows = this.db
          .prepare(
            `SELECT root_hex, from_chain_index, to_chain_index, entry_count, computed_at
             FROM worm_merkle_roots ORDER BY from_chain_index ASC`
          )
          .all() as Array<{
          root_hex: string;
          from_chain_index: number;
          to_chain_index: number;
          entry_count: number;
          computed_at: string;
        }>;
        return rows.map((r) => ({
          rootHex: r.root_hex,
          fromChainIndex: r.from_chain_index,
          toChainIndex: r.to_chain_index,
          entryCount: r.entry_count,
          computedAt: r.computed_at,
        }));
      },
      catch: (cause) => new AuditError({ reason: "SQLite listMerkleRoots failed", cause }),
    });

  query = (filter: WORMFilter): Effect.Effect<WORMEntry[], AuditError> =>
    Effect.try({
      try: () => {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (filter.sessionId) {
          conditions.push(`json_extract(entry_json, '$.sessionId') = ?`);
          params.push(filter.sessionId);
        }
        if (filter.type) {
          conditions.push(`json_extract(entry_json, '$.type') = ?`);
          params.push(filter.type);
        }
        if (filter.agentName) {
          conditions.push(`json_extract(entry_json, '$.agentName') = ?`);
          params.push(filter.agentName);
        }
        if (filter.since) {
          conditions.push(`json_extract(entry_json, '$.timestamp') >= ?`);
          params.push(filter.since);
        }
        if (filter.until) {
          conditions.push(`json_extract(entry_json, '$.timestamp') <= ?`);
          params.push(filter.until);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        let sql = `SELECT entry_json FROM worm_entries ${where} ORDER BY chain_index ASC`;
        if (filter.limit !== undefined) {
          sql += ` LIMIT ${Number(filter.limit)}`;
          if (filter.offset !== undefined) {
            sql += ` OFFSET ${Number(filter.offset)}`;
          }
        } else if (filter.offset !== undefined) {
          sql += ` LIMIT -1 OFFSET ${Number(filter.offset)}`;
        }
        const rows = this.db.prepare(sql).all(...params) as { entry_json: string }[];
        return rows.map((r) => JSON.parse(r.entry_json) as WORMEntry);
      },
      catch: (cause) => new AuditError({ reason: "SQLite query failed", cause }),
    });

  all = (): Effect.Effect<WORMEntry[], AuditError> => this.query({});

  latestEntry = (): Effect.Effect<WORMEntry | null, AuditError> =>
    Effect.try({
      try: () => {
        const row = this.db
          .prepare(`SELECT entry_json FROM worm_entries ORDER BY chain_index DESC LIMIT 1`)
          .get() as { entry_json: string } | undefined;
        return row ? (JSON.parse(row.entry_json) as WORMEntry) : null;
      },
      catch: (cause) => new AuditError({ reason: "SQLite latestEntry failed", cause }),
    });

  close(): void {
    this.db.close();
  }
}
