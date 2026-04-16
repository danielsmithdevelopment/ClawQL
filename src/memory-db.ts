/**
 * Colocated SQLite `memory.db` — schema + migrations + vault document / chunk / wikilink sync (#27).
 *
 * Uses sql.js (WASM) so installs work with `npm ci --ignore-scripts` and Node 20+ CI.
 */

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { getObsidianVaultPath } from "./vault-config.js";
import { resolveVaultPath } from "./vault-utils.js";
import { readVaultTextFile } from "./vault-utils.js";
import { slugifyTitle } from "./memory-ingest.js";
import {
  CHUNK_STRATEGY_PARAGRAPH_V1,
  planVaultMarkdownChunks,
  vaultChunkId,
} from "./memory-chunk.js";
import { extractWikilinkTargets } from "./vault-markdown.js";
import { buildSlugToVaultPath, listVaultMarkdownRelPaths } from "./memory-slug-index.js";

const SCHEMA_VERSION = 1;

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function loadSqlJs(): Promise<ReturnType<typeof initSqlJs>> {
  if (sqlJsPromise) return sqlJsPromise;
  const require = createRequire(import.meta.url);
  const sqlEntry = require.resolve("sql.js");
  const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
  sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  return sqlJsPromise;
}

/** When unset or relative, DB lives under the vault (default `memory.db`). */
export function resolveMemoryDatabasePath(vaultRoot: string): string {
  const raw = process.env.CLAWQL_MEMORY_DB_PATH?.trim();
  if (raw && isAbsolute(raw)) {
    return raw;
  }
  const rel = (raw || "memory.db").replace(/\\/g, "/").replace(/^\/+/, "");
  return resolveVaultPath(vaultRoot, rel);
}

export function memoryDbSyncEnabled(): boolean {
  if (process.env.CLAWQL_MEMORY_DB === "0") return false;
  return getObsidianVaultPath() !== null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function sha256Utf8(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function extractTitle(markdown: string): string {
  const body = markdown;
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 4);
    if (end !== -1) {
      const rest = body.slice(end + 5);
      const hm = rest.match(/^\s*#\s+(.+)$/m);
      if (hm) return hm[1].trim();
    }
  }
  const hm = body.match(/^\s*#\s+(.+)$/m);
  if (hm) return hm[1].trim();
  return slugifyTitle(basename(body, ".md"));
}

function currentSchemaVersion(db: Database): number {
  try {
    const cur = db.exec("SELECT MAX(version) AS v FROM schema_migrations");
    const cell = cur[0]?.values[0]?.[0];
    if (cell === null || cell === undefined) return 0;
    const n = Number(cell);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const v = currentSchemaVersion(db);
  if (v >= SCHEMA_VERSION) return;

  if (v < 1) {
    db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE vault_document (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body_sha256 TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        mtime_ms INTEGER,
        index_body_sha256 TEXT,
        chunk_strategy TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE vault_chunk (
        chunk_id TEXT PRIMARY KEY,
        document_path TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        char_start INTEGER NOT NULL,
        char_end INTEGER NOT NULL,
        text TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        chunk_strategy TEXT NOT NULL,
        embedding_model TEXT,
        embedding BLOB,
        FOREIGN KEY (document_path) REFERENCES vault_document(path) ON DELETE CASCADE
      );

      CREATE INDEX idx_vault_chunk_document ON vault_chunk(document_path);

      CREATE TABLE wikilink_edge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_path TEXT NOT NULL,
        to_target TEXT NOT NULL,
        to_resolved_path TEXT,
        UNIQUE(from_path, to_target)
      );

      CREATE INDEX idx_wikilink_from ON wikilink_edge(from_path);
      CREATE INDEX idx_wikilink_to_resolved ON wikilink_edge(to_resolved_path);
    `);
    db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'initial', ?)", [
      isoNow(),
    ]);
  }
}

export function recallSyncDbEnabled(): boolean {
  return process.env.CLAWQL_MEMORY_DB_SYNC_ON_RECALL === "1";
}

async function openOrCreateDb(absDbPath: string): Promise<Database> {
  const SQL = await loadSqlJs();
  try {
    const buf = await readFile(absDbPath);
    return new SQL.Database(buf);
  } catch {
    return new SQL.Database();
  }
}

async function persistDb(db: Database, absDbPath: string): Promise<void> {
  const data = db.export();
  await mkdir(dirname(absDbPath), { recursive: true });
  const tmp = `${absDbPath}.${process.pid}.tmp`;
  await writeFile(tmp, Buffer.from(data));
  await rename(tmp, absDbPath);
}

function defaultScanRoot(): string {
  const v = process.env.CLAWQL_MEMORY_RECALL_SCAN_ROOT;
  if (v === undefined) return "Memory";
  const t = v.trim();
  return t === "" ? "" : t;
}

function envInt(key: string, def: number): number {
  const v = process.env[key]?.trim();
  if (!v) return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/**
 * Upsert indexed rows for the given vault Markdown snapshots (single transaction + one disk flush).
 * Callers should hold the vault write lock when writes must serialize with `memory_ingest`.
 */
export async function syncMemoryDbFromDocuments(
  vaultRoot: string,
  documents: { path: string; text: string; mtimeMs: number }[]
): Promise<void> {
  if (!memoryDbSyncEnabled() || documents.length === 0) return;

  const absDb = resolveMemoryDatabasePath(vaultRoot);
  const db = await openOrCreateDb(absDb);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const slugMap = buildSlugToVaultPath(documents);
    const indexedAt = isoNow();

    const delDoc = db.prepare("DELETE FROM vault_document WHERE path = ?");
    const insDoc = db.prepare(
      `INSERT INTO vault_document (
        path, title, body_sha256, byte_length, mtime_ms, index_body_sha256, chunk_strategy, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insChunk = db.prepare(
      `INSERT INTO vault_chunk (
        chunk_id, document_path, ordinal, char_start, char_end, text, content_sha256, chunk_strategy, embedding_model, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    );
    const delEdges = db.prepare("DELETE FROM wikilink_edge WHERE from_path = ?");
    const insEdge = db.prepare(
      `INSERT OR REPLACE INTO wikilink_edge (from_path, to_target, to_resolved_path) VALUES (?, ?, ?)`
    );

    db.run("BEGIN");
    try {
      for (const doc of documents) {
        const path = doc.path.replace(/\\/g, "/");
        const bodySha = sha256Utf8(doc.text);
        const byteLen = Buffer.byteLength(doc.text, "utf8");
        const title = extractTitle(doc.text);
        const plan = planVaultMarkdownChunks(doc.text);

        delEdges.run([path]);
        delDoc.run([path]);

        insDoc.run([
          path,
          title,
          bodySha,
          byteLen,
          doc.mtimeMs,
          plan.indexBodySha256,
          plan.strategy,
          indexedAt,
        ]);

        for (const c of plan.chunks) {
          const id = vaultChunkId(path, CHUNK_STRATEGY_PARAGRAPH_V1, c.ordinal, c.contentSha256);
          insChunk.run([
            id,
            path,
            c.ordinal,
            c.charStart,
            c.charEnd,
            c.text,
            c.contentSha256,
            plan.strategy,
          ]);
        }

        for (const target of extractWikilinkTargets(doc.text)) {
          const slug = slugifyTitle(target);
          const resolved = slugMap.get(slug) ?? null;
          insEdge.run([path, target, resolved]);
        }
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    } finally {
      delDoc.free();
      insDoc.free();
      insChunk.free();
      delEdges.free();
      insEdge.free();
    }

    await persistDb(db, absDb);
  } finally {
    db.close();
  }
}

/** Full scan of the configured recall subtree — for `memory_ingest` refresh after writes. */
export async function syncMemoryDbForVaultScanRoot(vaultRoot: string): Promise<void> {
  if (!memoryDbSyncEnabled()) return;
  const maxFiles = envInt("CLAWQL_MEMORY_RECALL_MAX_FILES", 2000);
  const scanRoot = defaultScanRoot();
  let rels: string[];
  try {
    rels = await listVaultMarkdownRelPaths(vaultRoot, scanRoot, maxFiles);
  } catch {
    return;
  }
  const documents: { path: string; text: string; mtimeMs: number }[] = [];
  const now = Date.now();
  for (const rel of rels) {
    try {
      const text = await readVaultTextFile(vaultRoot, rel);
      documents.push({ path: rel, text, mtimeMs: now });
    } catch {
      /* skip */
    }
  }
  await syncMemoryDbFromDocuments(vaultRoot, documents);
}

/** Load stored wikilink rows for graph merge (paths normalized with `/`). */
export async function loadWikilinkEdgesFromDatabase(
  vaultRoot: string,
  fromPaths: string[]
): Promise<{ fromPath: string; toPath: string }[]> {
  if (!memoryDbSyncEnabled() || fromPaths.length === 0) return [];
  const absDb = resolveMemoryDatabasePath(vaultRoot);
  const db = await openOrCreateDb(absDb);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const out: { fromPath: string; toPath: string }[] = [];
    const chunk = 400;
    for (let i = 0; i < fromPaths.length; i += chunk) {
      const slice = fromPaths.slice(i, i + chunk);
      if (slice.length === 0) continue;
      const placeholders = slice.map(() => "?").join(",");
      const stmt = db.prepare(
        `SELECT from_path, to_resolved_path FROM wikilink_edge WHERE from_path IN (${placeholders}) AND to_resolved_path IS NOT NULL`
      );
      stmt.bind(slice);
      while (stmt.step()) {
        const row = stmt.getAsObject() as { from_path: string; to_resolved_path: string };
        out.push({ fromPath: row.from_path, toPath: row.to_resolved_path });
      }
      stmt.free();
    }
    return out;
  } finally {
    db.close();
  }
}

