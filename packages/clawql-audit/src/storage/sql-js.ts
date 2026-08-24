import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import initSqlJs from "sql.js";
import { Effect } from "effect";
import type { WORMEntry, WORMFilter } from "../entry.js";
import { WormStorageError } from "../errors.js";
import type { StorageBackend } from "./types.js";

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

function sqlJsRequire(): ReturnType<typeof createRequire> {
  const metaUrl = import.meta.url;
  if (typeof metaUrl === "string" && metaUrl.length > 0) {
    return createRequire(metaUrl);
  }
  // CJS bundle without a shim: resolve from cwd (hoisted or nested sql.js).
  return createRequire(join(process.cwd(), "package.json"));
}

async function loadSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (sqlJsPromise) return sqlJsPromise;
  const require = sqlJsRequire();
  const sqlEntry = require.resolve("sql.js");
  const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
  sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  return sqlJsPromise;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS worm_entries (
  id TEXT PRIMARY KEY,
  seq INTEGER UNIQUE NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  prev_hash TEXT NOT NULL,
  written_at TEXT NOT NULL,
  entry_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worm_outbox (
  id TEXT PRIMARY KEY,
  entry_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function matches(entry: WORMEntry, filter: WORMFilter): boolean {
  if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
  if (filter.type && entry.type !== filter.type) return false;
  if (filter.since && entry.timestamp < filter.since) return false;
  if (filter.until && entry.timestamp > filter.until) return false;
  return true;
}

function parseEntry(json: string): WORMEntry {
  return JSON.parse(json) as WORMEntry;
}

function storageFail(message: string, cause?: unknown) {
  return new WormStorageError({ message, cause });
}

export type SqliteBackendHandle = {
  readonly backend: StorageBackend;
  readonly close: () => Effect.Effect<void, WormStorageError>;
};

export const openSqliteBackend = (
  dbPath: string
): Effect.Effect<SqliteBackendHandle, WormStorageError> =>
  Effect.gen(function* () {
    const SQL = yield* Effect.tryPromise({
      try: () => loadSqlJs(),
      catch: (cause) => storageFail("failed to load sql.js", cause),
    });

    yield* Effect.tryPromise({
      try: () => mkdir(dirname(dbPath), { recursive: true }),
      catch: (cause) => storageFail("failed to create db directory", cause),
    });

    const existing = yield* Effect.promise(async () => {
      try {
        return await readFile(dbPath);
      } catch {
        return undefined;
      }
    });
    const db = yield* Effect.try({
      try: () => (existing ? new SQL.Database(existing) : new SQL.Database()),
      catch: (cause) => storageFail("failed to open sqlite database", cause),
    });

    for (const stmt of SCHEMA.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      db.run(stmt);
    }

    const persist = () =>
      Effect.tryPromise({
        try: async () => {
          const data = db.export();
          await writeFile(dbPath, Buffer.from(data));
        },
        catch: (cause) => storageFail("failed to persist sqlite database", cause),
      });

    const runTxn = (fn: () => void) =>
      Effect.sync(() => {
        db.run("BEGIN");
        try {
          fn();
          db.run("COMMIT");
        } catch (cause) {
          db.run("ROLLBACK");
          throw cause;
        }
      }).pipe(
        Effect.flatMap(() => persist()),
        Effect.mapError((err) => {
          const message = err instanceof Error ? err.message : String(err);
          return storageFail(`sqlite transaction failed: ${message}`, err);
        })
      );

    const insertEntrySql = `
      INSERT INTO worm_entries (id, seq, hash, prev_hash, written_at, entry_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const insertOutboxSql = `
      INSERT INTO worm_outbox (id, entry_json, created_at)
      VALUES (?, ?, ?)
    `;

    const backend: StorageBackend = {
      writeCommitted: (entry) =>
        runTxn(() => {
          db.run(insertEntrySql, [
            entry.id,
            entry.seq,
            entry.hash,
            entry.prev_hash,
            entry.writtenAt,
            JSON.stringify(entry),
          ]);
        }),

      writeWithOutbox: (entry) =>
        runTxn(() => {
          db.run(insertEntrySql, [
            entry.id,
            entry.seq,
            entry.hash,
            entry.prev_hash,
            entry.writtenAt,
            JSON.stringify(entry),
          ]);
          db.run(insertOutboxSql, [entry.id, JSON.stringify(entry), new Date().toISOString()]);
        }),

      query: (filter) =>
        Effect.sync(() => {
          const rows = db.exec("SELECT entry_json FROM worm_entries ORDER BY seq ASC");
          if (rows.length === 0) return [];
          return rows[0]!.values
            .map((row) => parseEntry(String(row[0])))
            .filter((e) => matches(e, filter));
        }),

      all: () =>
        Effect.sync(() => {
          const rows = db.exec("SELECT entry_json FROM worm_entries ORDER BY seq ASC");
          if (rows.length === 0) return [];
          return rows[0]!.values.map((row) => parseEntry(String(row[0])));
        }),

      latestEntry: () =>
        Effect.sync(() => {
          const rows = db.exec("SELECT entry_json FROM worm_entries ORDER BY seq DESC LIMIT 1");
          if (rows.length === 0 || rows[0]!.values.length === 0) return null;
          return parseEntry(String(rows[0]!.values[0]![0]));
        }),

      outboxList: () =>
        Effect.sync(() => {
          const rows = db.exec("SELECT entry_json FROM worm_outbox ORDER BY created_at ASC");
          if (rows.length === 0) return [];
          return rows[0]!.values.map((row) => parseEntry(String(row[0])));
        }),

      outboxDelete: (id) =>
        Effect.sync(() => {
          db.run("DELETE FROM worm_outbox WHERE id = ?", [id]);
        }).pipe(Effect.flatMap(() => persist())),
    };

    return {
      backend,
      close: () =>
        Effect.sync(() => {
          db.close();
        }),
    };
  });
