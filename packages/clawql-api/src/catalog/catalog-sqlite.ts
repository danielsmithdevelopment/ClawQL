/**
 * Colocated read-only OpenAPI catalog in SQLite (`node:sqlite`).
 *
 * Goal: Ready RSS scales with the **hot** working set (compact `Operation[]` for
 * search) instead of retaining the full OAS object graph. Cold OpenAPI docs are
 * gzip'd in SQLite and materialised on first execute touch.
 *
 * Default **on**. Opt out: **`CLAWQL_CATALOG_SQLITE=0`**.
 * Path: **`CLAWQL_CATALOG_SQLITE_PATH`** (default `$CLAWQL_HOME/catalog.sqlite`)
 * Precompiled listen: **`CLAWQL_CATALOG_SQLITE_LOAD=db`** (skip OAS parse when DB exists).
 *
 * **Build mode (default `oop`):** when the gateway would otherwise parse a spec to
 * create/refresh `catalog.sqlite`, it spawns
 * `catalog/build-catalog-sqlite-cli` in a short-lived child, waits for exit, then
 * opens the DB read-only (`LOAD=db`). The parsed OAS dies with the child — JS
 * runtimes rarely return that RSS to the OS otherwise. Opt into the old
 * in-process persist path with **`CLAWQL_CATALOG_SQLITE_BUILD=inprocess`**.
 *
 * Search stays the in-memory weighted keyword scan over `operations` — no FTS/BM25.
 */

import { gzipSync, gunzipSync } from "node:zlib";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Effect, Layer } from "effect";
import { resolveClawqlHome } from "../spec/custom-sources-store.js";
import type { Operation } from "../spec/operation-types.js";
import type { LoadedSpec, OpenAPIDoc } from "../spec/spec-loader.js";

type DatabaseSyncInstance = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

type DatabaseSyncCtor = new (
  path: string,
  options?: { readonly readOnly?: boolean }
) => DatabaseSyncInstance;

function loadDatabaseSync(): DatabaseSyncCtor {
  try {
    const req = createRequire(import.meta.url);
    return (req("node:sqlite") as { DatabaseSync: DatabaseSyncCtor }).DatabaseSync;
  } catch {
    const req = createRequire(import.meta.url);
    return (req("sqlite") as { DatabaseSync: DatabaseSyncCtor }).DatabaseSync;
  }
}

/** Default on; only `0` / `false` / `no` / `off` disable. */
function envFlagDefaultOn(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return true;
  const t = raw.trim().toLowerCase();
  return t !== "0" && t !== "false" && t !== "no" && t !== "off";
}

export const catalogSqliteEnabled = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> => Effect.sync(() => envFlagDefaultOn(env.CLAWQL_CATALOG_SQLITE));

export const resolveCatalogSqlitePath = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<string> =>
  Effect.sync(() => {
    const override = env.CLAWQL_CATALOG_SQLITE_PATH?.trim();
    if (override) return override;
    return join(resolveClawqlHome(), "catalog.sqlite");
  });

/** When path exists and flag on, skip OpenAPI JSON parse at listen (precompiled catalog). */
export const catalogSqliteReadonlyLoad = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* catalogSqliteEnabled(env))) return false;
    const path = yield* resolveCatalogSqlitePath(env);
    return existsSync(path);
  });

/** Default `oop`; only `inprocess` / `inline` / `0` keep parse+persist inside the gateway. */
export const catalogSqliteBuildOutOfProcess = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const raw = (env.CLAWQL_CATALOG_SQLITE_BUILD ?? "oop").trim().toLowerCase();
    if (raw === "inprocess" || raw === "inline" || raw === "0" || raw === "off") {
      return false;
    }
    return true;
  });

export const catalogSqliteForceRebuild = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.sync(() => {
    const t = (env.CLAWQL_CATALOG_SQLITE_REBUILD ?? "").trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes" || t === "on";
  });

function localSpecPaths(env: NodeJS.ProcessEnv): string[] {
  return [
    env.CLAWQL_SPEC_PATH,
    env.OPENAPI_SPEC_PATH,
    env.OPENAPI_FILE,
    ...(env.CLAWQL_SPEC_PATHS ?? "")
      .split(/[,:\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ].filter((p): p is string => Boolean(p?.trim()));
}

/**
 * True when the gateway should (re)build catalog.sqlite before LOAD=db.
 * File specs: rebuild if DB missing or any local OAS is newer than the DB.
 * Non-file sources (URL / provider packs): rebuild only when DB missing or
 * `CLAWQL_CATALOG_SQLITE_REBUILD=1`.
 */
export const catalogSqliteNeedsRebuild = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* catalogSqliteEnabled(env))) return false;
    if (yield* catalogSqliteForceRebuild(env)) return true;
    const path = yield* resolveCatalogSqlitePath(env);
    if (!existsSync(path)) return true;
    let dbMtime: number;
    try {
      dbMtime = statSync(path).mtimeMs;
    } catch {
      return true;
    }
    for (const spec of localSpecPaths(env)) {
      try {
        if (existsSync(spec) && statSync(spec).mtimeMs > dbMtime) return true;
      } catch {
        /* ignore unreadable paths */
      }
    }
    return false;
  });

function resolveBuildCatalogCliPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // tsup may place this module in dist/chunk-*.js while the CLI entry is
  // dist/catalog/build-catalog-sqlite-cli.js — probe both layouts.
  const candidates = [
    join(here, "catalog", "build-catalog-sqlite-cli.js"),
    join(here, "build-catalog-sqlite-cli.js"),
    join(here, "catalog", "build-catalog-sqlite-cli.ts"),
    join(here, "build-catalog-sqlite-cli.ts"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  spec_index INTEGER NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS openapi_docs (
  spec_index INTEGER PRIMARY KEY,
  json_gz BLOB NOT NULL
);
`.trim();

function openDb(path: string, readOnly: boolean): DatabaseSyncInstance {
  if (!readOnly) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const DatabaseSync = loadDatabaseSync();
  const db = readOnly
    ? new DatabaseSync(path, { readOnly: true })
    : new DatabaseSync(path);
  if (!readOnly) db.exec(SCHEMA_SQL);
  return db;
}

export type CatalogSqliteWriteInput = {
  readonly operations: readonly Operation[];
  readonly openapis: readonly OpenAPIDoc[];
  readonly multi?: boolean;
};

export const writeCatalogSqliteEffect = (
  path: string,
  input: CatalogSqliteWriteInput
): Effect.Effect<void, Error> =>
  Effect.try({
    try: () => {
      const db = openDb(path, false);
      try {
        db.exec("DELETE FROM operations; DELETE FROM openapi_docs; DELETE FROM meta;");
        const insMeta = db.prepare("INSERT INTO meta(key, value) VALUES (?, ?)");
        insMeta.run("version", "1");
        insMeta.run("multi", input.multi || input.openapis.length > 1 ? "1" : "0");
        insMeta.run("ops", String(input.operations.length));
        insMeta.run("docs", String(input.openapis.length));
        insMeta.run("written_at", new Date().toISOString());

        const insOp = db.prepare(
          "INSERT INTO operations(id, spec_index, json) VALUES (?, ?, ?)"
        );
        for (const op of input.operations) {
          insOp.run(op.id, op.specIndex ?? 0, JSON.stringify(op));
        }

        const insDoc = db.prepare(
          "INSERT INTO openapi_docs(spec_index, json_gz) VALUES (?, ?)"
        );
        input.openapis.forEach((doc, i) => {
          const gz = gzipSync(Buffer.from(JSON.stringify(doc), "utf8"), { level: 6 });
          insDoc.run(i, gz);
        });
        db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      } finally {
        db.close();
      }
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export function writeCatalogSqlite(path: string, input: CatalogSqliteWriteInput): void {
  Effect.runSync(writeCatalogSqliteEffect(path, input));
}

function readMeta(db: DatabaseSyncInstance, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value?: string }
    | undefined;
  return typeof row?.value === "string" ? row.value : null;
}

function readOperations(db: DatabaseSyncInstance): Operation[] {
  const rows = db.prepare("SELECT json FROM operations ORDER BY rowid").all() as Array<{
    json: string;
  }>;
  return rows.map((r) => JSON.parse(r.json) as Operation);
}

function readOpenapiDoc(db: DatabaseSyncInstance, specIndex: number): OpenAPIDoc {
  const row = db
    .prepare("SELECT json_gz FROM openapi_docs WHERE spec_index = ?")
    .get(specIndex) as { json_gz?: Buffer | Uint8Array } | undefined;
  if (!row?.json_gz) {
    throw new Error(`[catalog-sqlite] missing openapi_docs spec_index=${specIndex}`);
  }
  const buf = Buffer.isBuffer(row.json_gz) ? row.json_gz : Buffer.from(row.json_gz);
  return JSON.parse(gunzipSync(buf).toString("utf8")) as OpenAPIDoc;
}

/** Lazy OpenAPIDoc — materialises from SQLite on first property access. */
function lazyOpenapiDoc(
  path: string,
  specIndex: number,
  cache: Map<number, OpenAPIDoc>
): OpenAPIDoc {
  const materialize = (): OpenAPIDoc => {
    const hit = cache.get(specIndex);
    if (hit) return hit;
    const db = openDb(path, true);
    try {
      const doc = readOpenapiDoc(db, specIndex);
      cache.set(specIndex, doc);
      return doc;
    } finally {
      db.close();
    }
  };
  return new Proxy({} as OpenAPIDoc, {
    get(_t, prop, receiver) {
      return Reflect.get(materialize(), prop, receiver);
    },
    has(_t, prop) {
      return prop in materialize();
    },
    ownKeys() {
      return Reflect.ownKeys(materialize());
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(materialize(), prop);
    },
    set(_t, prop, value, receiver) {
      return Reflect.set(materialize(), prop, value, receiver);
    },
  });
}

export type CatalogSqliteSlim = LoadedSpec & {
  readonly catalogBackend: "sqlite";
  readonly catalogSqlitePath: string;
};

export const loadCatalogSqliteSlimEffect = (
  path: string
): Effect.Effect<CatalogSqliteSlim, Error> =>
  Effect.try({
    try: () => {
      const db = openDb(path, true);
      try {
        const ops = readOperations(db);
        const docs = Number.parseInt(readMeta(db, "docs") ?? "1", 10) || 1;
        const multi = readMeta(db, "multi") === "1" || docs > 1;
        const cache = new Map<number, OpenAPIDoc>();
        const openapi = lazyOpenapiDoc(path, 0, cache);
        const openapis =
          docs > 1
            ? Array.from({ length: docs }, (_, i) => lazyOpenapiDoc(path, i, cache))
            : undefined;
        return {
          operations: ops,
          openapi,
          openapis,
          rawSource: openapi as unknown as Record<string, unknown>,
          multi: multi || undefined,
          catalogBackend: "sqlite" as const,
          catalogSqlitePath: path,
        };
      } finally {
        db.close();
      }
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  });

export function loadCatalogSqliteSlim(path: string): CatalogSqliteSlim {
  return Effect.runSync(loadCatalogSqliteSlimEffect(path));
}

/**
 * Spawn a short-lived builder that parses sources and writes catalog.sqlite,
 * then load the slim view in this process (never parse OAS here).
 */
export const buildCatalogSqliteOutOfProcessEffect = (
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CatalogSqliteSlim, Error> =>
  Effect.gen(function* () {
    const path = yield* resolveCatalogSqlitePath(env);
    const cli = resolveBuildCatalogCliPath();
    if (!existsSync(cli)) {
      return yield* Effect.fail(
        new Error(`[catalog-sqlite] oop builder missing: ${cli} (rebuild clawql-api)`)
      );
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    console.error(`[catalog-sqlite] oop-build starting → ${path} via ${cli}`);
    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [cli], {
            env: {
              ...env,
              CLAWQL_CATALOG_SQLITE: "0",
              CLAWQL_CATALOG_SQLITE_PATH: path,
              CLAWQL_CATALOG_SQLITE_OOP_CHILD: "1",
            },
            stdio: ["ignore", "inherit", "inherit"],
          });
          child.on("error", reject);
          child.on("exit", (code, signal) => {
            if (code === 0) resolve();
            else {
              reject(
                new Error(
                  `[catalog-sqlite] oop-build exited code=${code} signal=${signal ?? ""}`
                )
              );
            }
          });
        }),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    if (!existsSync(path)) {
      return yield* Effect.fail(
        new Error(`[catalog-sqlite] oop-build finished but missing ${path}`)
      );
    }
    const slim = yield* loadCatalogSqliteSlimEffect(path);
    console.error(
      `[catalog-sqlite] loaded ${slim.operations.length} operations from ${path} (LOAD=db after oop-build)`
    );
    return slim;
  });

/**
 * Persist a fully-parsed `LoadedSpec` to SQLite and return a slim view that keeps
 * only `operations` hot; OAS graphs are GC-eligible after this returns.
 */
export const persistLoadedSpecToCatalogSqliteEffect = (
  loaded: LoadedSpec,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<CatalogSqliteSlim, Error> =>
  Effect.gen(function* () {
    const path = yield* resolveCatalogSqlitePath(env);
    const openapis =
      loaded.openapis && loaded.openapis.length > 0
        ? loaded.openapis
        : loaded.openapi
          ? [loaded.openapi]
          : [];
    if (openapis.length === 0) {
      return yield* Effect.fail(new Error("[catalog-sqlite] no openapi docs to persist"));
    }
    yield* writeCatalogSqliteEffect(path, {
      operations: loaded.operations,
      openapis,
      multi: loaded.multi,
    });
    console.error(
      `[catalog-sqlite] wrote ${path} ops=${loaded.operations.length} docs=${openapis.length}`
    );
    return yield* loadCatalogSqliteSlimEffect(path);
  });

export type CatalogSqliteApi = {
  readonly enabled: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  readonly resolvePath: (env?: NodeJS.ProcessEnv) => Effect.Effect<string>;
  readonly buildOutOfProcess: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  readonly needsRebuild: (env?: NodeJS.ProcessEnv) => Effect.Effect<boolean>;
  readonly write: (
    path: string,
    input: CatalogSqliteWriteInput
  ) => Effect.Effect<void, Error>;
  readonly loadSlim: (path: string) => Effect.Effect<CatalogSqliteSlim, Error>;
  readonly persistLoaded: (
    loaded: LoadedSpec,
    env?: NodeJS.ProcessEnv
  ) => Effect.Effect<CatalogSqliteSlim, Error>;
  readonly buildOutOfProcessAndLoad: (
    env?: NodeJS.ProcessEnv
  ) => Effect.Effect<CatalogSqliteSlim, Error>;
};

export class CatalogSqliteService extends Context.Service<
  CatalogSqliteService,
  CatalogSqliteApi
>()("clawql/CatalogSqliteService") {}

export const CatalogSqliteLive = Layer.succeed(CatalogSqliteService, {
  enabled: catalogSqliteEnabled,
  resolvePath: resolveCatalogSqlitePath,
  buildOutOfProcess: catalogSqliteBuildOutOfProcess,
  needsRebuild: catalogSqliteNeedsRebuild,
  write: writeCatalogSqliteEffect,
  loadSlim: loadCatalogSqliteSlimEffect,
  persistLoaded: persistLoadedSpecToCatalogSqliteEffect,
  buildOutOfProcessAndLoad: buildCatalogSqliteOutOfProcessEffect,
});
