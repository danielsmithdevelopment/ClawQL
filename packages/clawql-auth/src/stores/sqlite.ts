/**
 * SQLite SecretStore — default for local dev, homelab, and Hermes personal agent.
 * Uses Node.js built-in `node:sqlite` (no native addon), loaded lazily so
 * consumers that bundle clawql-auth (e.g. clawql-api Docker builds) do not need
 * to resolve `sqlite` at bundle time unless this store is constructed.
 *
 * `node:sqlite` is synchronous, so KV methods wrap it with `Effect.try` (not
 * `Effect.tryPromise`) and map failures onto {@link SecretStoreError}.
 */

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";

export type SQLiteSecretStoreOptions = {
  /** Absolute or tilde-expanded path to the SQLite file. */
  path: string;
};

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

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return `${home}/${p.slice(2)}`;
  }
  return p;
}

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export class SQLiteSecretStore extends PathSecretStore {
  private readonly db: DatabaseSyncInstance;

  constructor(options: SQLiteSecretStoreOptions) {
    super();
    const path = expandHome(options.path);
    mkdirSync(dirname(path), { recursive: true });
    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        path TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS secrets_path_prefix ON secrets(path);
    `);
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.try({
      try: () => {
        const row = this.db.prepare("SELECT value FROM secrets WHERE path = ?").get(path) as
          | { value: string }
          | undefined;
        return row?.value ?? null;
      },
      catch: (cause) =>
        new SecretStoreError({ reason: `sqlite_get_failed: ${errMsg(cause)}`, cause }),
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.try({
      try: () => {
        const now = new Date().toISOString();
        this.db
          .prepare(
            `INSERT INTO secrets(path, value, updated_at) VALUES(?, ?, ?)
             ON CONFLICT(path) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
          .run(path, value, now);
      },
      catch: (cause) =>
        new SecretStoreError({ reason: `sqlite_set_failed: ${errMsg(cause)}`, cause }),
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return Effect.try({
      try: () => {
        this.db.prepare("DELETE FROM secrets WHERE path = ?").run(path);
      },
      catch: (cause) =>
        new SecretStoreError({ reason: `sqlite_delete_failed: ${errMsg(cause)}`, cause }),
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    return Effect.try({
      try: () => {
        const rows = this.db
          .prepare("SELECT path FROM secrets WHERE path LIKE ? ORDER BY path")
          .all(`${prefix}%`) as Array<{ path: string }>;
        return rows.map((r) => r.path);
      },
      catch: (cause) =>
        new SecretStoreError({ reason: `sqlite_list_failed: ${errMsg(cause)}`, cause }),
    });
  }

  close(): Effect.Effect<void, SecretStoreError> {
    return Effect.try({
      try: () => this.db.close(),
      catch: (cause) =>
        new SecretStoreError({ reason: `sqlite_close_failed: ${errMsg(cause)}`, cause }),
    });
  }
}

export function createSQLiteSecretStore(options: SQLiteSecretStoreOptions): SQLiteSecretStore {
  return new SQLiteSecretStore(options);
}

/** Homelab / Hermes default path under CLAWQL_HOME or ~/.clawql. */
export function defaultSQLiteSecretPath(): string {
  const home = process.env.CLAWQL_HOME?.trim() || `${process.env.HOME ?? ""}/.clawql`;
  return `${home.replace(/\/$/, "")}/secrets.db`;
}
