/**
 * Hash-chained append-only auth audit log (WORM) for MCP OAuth / API key events.
 * Default backend: SQLite under CLAWQL_HOME. Hosts inject via {@link createAuthEventSinkFromEnv}.
 */

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { Context, Data, Effect, Layer } from "effect";

import type { AuthEvent } from "./auth-events.js";

export const AUTH_WORM_GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

export type AuthWormRecord = {
  seq: number;
  prev_hash: string;
  hash: string;
  event: AuthEvent;
  created_at: string;
};

export type AuthWormVerifyResult = {
  ok: boolean;
  records: number;
  head_hash: string;
  issues: { seq: number; reason: string }[];
};

export class AuthWormError extends Data.TaggedError("AuthWormError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function canonicalAuthWormBytes(link: Omit<AuthWormRecord, "hash">): Buffer {
  return Buffer.from(
    JSON.stringify({
      seq: link.seq,
      prev_hash: link.prev_hash,
      event: link.event,
      created_at: link.created_at,
    }),
    "utf8"
  );
}

export function hashAuthWormLink(link: Omit<AuthWormRecord, "hash">): string {
  return createHash("sha256").update(canonicalAuthWormBytes(link)).digest("hex");
}

export function sealAuthWormRecord(input: {
  event: AuthEvent;
  seq: number;
  prev_hash: string;
  created_at?: string;
}): AuthWormRecord {
  const created_at = input.created_at ?? new Date().toISOString();
  const link: Omit<AuthWormRecord, "hash"> = {
    seq: input.seq,
    prev_hash: input.prev_hash,
    event: input.event,
    created_at,
  };
  return { ...link, hash: hashAuthWormLink(link) };
}

export function verifyAuthWormChain(records: AuthWormRecord[]): AuthWormVerifyResult {
  const issues: { seq: number; reason: string }[] = [];
  let expectedSeq = 1;
  let prevHash = AUTH_WORM_GENESIS_HASH;
  for (const record of records) {
    if (record.seq !== expectedSeq) {
      issues.push({ seq: record.seq, reason: `expected seq ${expectedSeq}, got ${record.seq}` });
    }
    if (record.prev_hash !== prevHash) {
      issues.push({ seq: record.seq, reason: `prev_hash mismatch at seq ${record.seq}` });
    }
    const recomputed = hashAuthWormLink(record);
    if (record.hash !== recomputed) {
      issues.push({ seq: record.seq, reason: `hash mismatch at seq ${record.seq}` });
    }
    expectedSeq = record.seq + 1;
    prevHash = record.hash;
  }
  return {
    ok: issues.length === 0,
    records: records.length,
    head_hash: records.length ? records[records.length - 1]!.hash : AUTH_WORM_GENESIS_HASH,
    issues,
  };
}

export type AuthWormStoreMode = "sqlite" | "memory" | "off";

export function resolveAuthAuditStoreMode(env: NodeJS.ProcessEnv = process.env): AuthWormStoreMode {
  const raw = env.CLAWQL_AUTH_AUDIT_STORE?.trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "memory") return "memory";
  return "sqlite";
}

export function defaultAuthAuditDbPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAWQL_AUTH_AUDIT_PATH?.trim();
  if (explicit) return expandHome(explicit);
  const home = env.CLAWQL_HOME?.trim() || `${env.HOME ?? ""}/.clawql`;
  return `${home.replace(/\/$/, "")}/auth-audit.db`;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return `${home}/${p.slice(2)}`;
  }
  return p;
}

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

export class AuthWormService extends Context.Tag("clawql/AuthWormService")<
  AuthWormService,
  {
    readonly append: (event: AuthEvent) => Effect.Effect<AuthWormRecord, AuthWormError>;
    readonly list: (limit?: number) => Effect.Effect<AuthWormRecord[], AuthWormError>;
    readonly verify: () => Effect.Effect<AuthWormVerifyResult, AuthWormError>;
    readonly reset: () => Effect.Effect<void, AuthWormError>;
  }
>() {}

function memoryAuthWormBackend(): AuthWormService["Type"] {
  let records: AuthWormRecord[] = [];
  return AuthWormService.of({
    append: (event) =>
      Effect.sync(() => {
        const prev_hash =
          records.length > 0 ? records[records.length - 1]!.hash : AUTH_WORM_GENESIS_HASH;
        const record = sealAuthWormRecord({
          event,
          seq: records.length + 1,
          prev_hash,
        });
        records = [...records, record];
        return record;
      }),
    list: (limit = 100) =>
      Effect.sync(() => {
        if (limit <= 0) return [];
        return records.slice(-limit);
      }),
    verify: () => Effect.sync(() => verifyAuthWormChain(records)),
    reset: () =>
      Effect.sync(() => {
        records = [];
      }),
  });
}

function sqliteAuthWormBackend(path: string): AuthWormService["Type"] {
  mkdirSync(dirname(path), { recursive: true });
  const DatabaseSync = loadDatabaseSync();
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_worm_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seq INTEGER NOT NULL DEFAULT 0,
      last_hash TEXT NOT NULL DEFAULT '${AUTH_WORM_GENESIS_HASH}'
    );
    CREATE TABLE IF NOT EXISTS auth_worm_entries (
      seq INTEGER PRIMARY KEY,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL,
      event_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO auth_worm_meta (id, seq, last_hash) VALUES (1, 0, '${AUTH_WORM_GENESIS_HASH}');
  `);

  const readMeta = (): { seq: number; last_hash: string } => {
    const row = db.prepare("SELECT seq, last_hash FROM auth_worm_meta WHERE id = 1").get() as
      { seq: number; last_hash: string } | undefined;
    return row ?? { seq: 0, last_hash: AUTH_WORM_GENESIS_HASH };
  };

  const loadAll = (): AuthWormRecord[] => {
    const rows = db
      .prepare(
        "SELECT seq, prev_hash, hash, event_json, created_at FROM auth_worm_entries ORDER BY seq"
      )
      .all() as Array<{
      seq: number;
      prev_hash: string;
      hash: string;
      event_json: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      seq: row.seq,
      prev_hash: row.prev_hash,
      hash: row.hash,
      event: JSON.parse(row.event_json) as AuthEvent,
      created_at: row.created_at,
    }));
  };

  return AuthWormService.of({
    append: (event) =>
      Effect.try({
        try: () => {
          const meta = readMeta();
          const seq = meta.seq + 1;
          const record = sealAuthWormRecord({
            event,
            seq,
            prev_hash: meta.last_hash,
          });
          db.prepare(
            `INSERT INTO auth_worm_entries (seq, prev_hash, hash, event_json, created_at)
             VALUES (?, ?, ?, ?, ?)`
          ).run(
            record.seq,
            record.prev_hash,
            record.hash,
            JSON.stringify(record.event),
            record.created_at
          );
          db.prepare("UPDATE auth_worm_meta SET seq = ?, last_hash = ? WHERE id = 1").run(
            record.seq,
            record.hash
          );
          return record;
        },
        catch: (cause) => new AuthWormError({ reason: "append_failed", cause }),
      }),
    list: (limit = 100) =>
      Effect.try({
        try: () => {
          const records = loadAll();
          if (limit <= 0) return [];
          return records.slice(-limit);
        },
        catch: (cause) => new AuthWormError({ reason: "list_failed", cause }),
      }),
    verify: () =>
      Effect.try({
        try: () => verifyAuthWormChain(loadAll()),
        catch: (cause) => new AuthWormError({ reason: "verify_failed", cause }),
      }),
    reset: () =>
      Effect.try({
        try: () => {
          db.exec(`
            DELETE FROM auth_worm_entries;
            UPDATE auth_worm_meta SET seq = 0, last_hash = '${AUTH_WORM_GENESIS_HASH}' WHERE id = 1;
          `);
        },
        catch: (cause) => new AuthWormError({ reason: "reset_failed", cause }),
      }),
  });
}

let defaultLayer: Layer.Layer<AuthWormService> | null = null;
let defaultLayerKey: string | null = null;

export function authWormLayerFromEnv(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<AuthWormService> {
  const mode = resolveAuthAuditStoreMode(env);
  const key =
    mode === "sqlite"
      ? `sqlite:${defaultAuthAuditDbPath(env)}`
      : mode === "memory"
        ? "memory"
        : "off";
  if (defaultLayer && defaultLayerKey === key) return defaultLayer;

  if (mode === "off") {
    defaultLayer = Layer.die(new AuthWormError({ reason: "auth_audit_store_off" }));
    defaultLayerKey = key;
    return defaultLayer;
  }

  const service =
    mode === "memory"
      ? memoryAuthWormBackend()
      : sqliteAuthWormBackend(defaultAuthAuditDbPath(env));
  defaultLayer = Layer.succeed(AuthWormService, service);
  defaultLayerKey = key;
  return defaultLayer;
}

export function authWormLayerForTests(
  mode: AuthWormStoreMode = "memory"
): Layer.Layer<AuthWormService> {
  if (mode === "off") {
    return Layer.die(new AuthWormError({ reason: "auth_audit_store_off" }));
  }
  const service =
    mode === "memory" ? memoryAuthWormBackend() : sqliteAuthWormBackend(defaultAuthAuditDbPath());
  return Layer.succeed(AuthWormService, service);
}

export async function resetAuthWormStoreForTests(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  defaultLayer = null;
  defaultLayerKey = null;
  const mode = resolveAuthAuditStoreMode(env);
  if (mode === "off") return;
  await Effect.runPromise(
    Effect.gen(function* () {
      const worm = yield* AuthWormService;
      yield* worm.reset();
    }).pipe(Effect.provide(authWormLayerFromEnv(env)))
  );
}

export async function listAuthWormRecords(
  limit = 100,
  env: NodeJS.ProcessEnv = process.env
): Promise<AuthWormRecord[]> {
  if (resolveAuthAuditStoreMode(env) === "off") return [];
  return Effect.runPromise(
    Effect.gen(function* () {
      const worm = yield* AuthWormService;
      return yield* worm.list(limit);
    }).pipe(Effect.provide(authWormLayerFromEnv(env)))
  );
}

export async function verifyAuthWormLog(
  env: NodeJS.ProcessEnv = process.env
): Promise<AuthWormVerifyResult> {
  if (resolveAuthAuditStoreMode(env) === "off") {
    return { ok: true, records: 0, head_hash: AUTH_WORM_GENESIS_HASH, issues: [] };
  }
  return Effect.runPromise(
    Effect.gen(function* () {
      const worm = yield* AuthWormService;
      return yield* worm.verify();
    }).pipe(Effect.provide(authWormLayerFromEnv(env)))
  );
}
