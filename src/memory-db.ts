/**
 * Colocated SQLite `memory.db` — schema + migrations + vault document / chunk / wikilink sync (#27).
 * Optional chunk embeddings for hybrid recall (#26) — float32 BLOBs on `vault_chunk` for every backend
 * (dual-write when postgres is selected; pgvector is additional — see docs/hybrid-memory-backends.md).
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
import {
  blobToFloat32Array,
  embedTexts,
  float32ArrayToBlob,
  resolveEmbeddingConfig,
  effectiveVectorBackend,
  vectorDualWriteToMemoryDb,
  type ChunkWithEmbedding,
} from "./memory-embedding.js";
import {
  loadPostgresChunkVectorsByPaths,
  upsertPostgresChunkVectors,
} from "./vector-store/pgvector.js";
import {
  rebuildSqliteMemoryArtifacts,
  syncMemoryArtifactsToPostgres,
  type MemoryArtifactPayload,
} from "./memory-artifacts.js";
import { CuckooFilter } from "./cuckoo-filter.js";

const SCHEMA_VERSION = 2;

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

  if (v < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clawql_cuckoo_chunk_membership (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        filter_blob BLOB NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS vault_merkle_snapshot (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        root_hex TEXT NOT NULL,
        leaf_count INTEGER NOT NULL,
        tree_height INTEGER NOT NULL,
        built_at TEXT NOT NULL
      );
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'cuckoo_merkle_v1', ?)",
      [isoNow()]
    );
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
type OldChunkEmb = { blob: Uint8Array; model: string | null };

async function loadExistingChunkEmbeddings(
  db: Database,
  paths: string[]
): Promise<Map<string, Map<string, OldChunkEmb>>> {
  const out = new Map<string, Map<string, OldChunkEmb>>();
  const sel = db.prepare(
    "SELECT chunk_id, embedding, embedding_model FROM vault_chunk WHERE document_path = ?"
  );
  for (const path of paths) {
    const m = new Map<string, OldChunkEmb>();
    sel.bind([path]);
    while (sel.step()) {
      const row = sel.getAsObject() as {
        chunk_id: string;
        embedding: Uint8Array | null;
        embedding_model: string | null;
      };
      if (row.embedding && row.embedding.byteLength > 0) {
        m.set(row.chunk_id, {
          blob: new Uint8Array(row.embedding),
          model: row.embedding_model,
        });
      }
    }
    sel.reset();
    out.set(path, m);
  }
  sel.free();
  return out;
}

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

    const normPaths = documents.map((d) => d.path.replace(/\\/g, "/"));
    const vb = effectiveVectorBackend();
    const oldEmbByPath =
      vb === "sqlite"
        ? await loadExistingChunkEmbeddings(db, normPaths)
        : new Map<string, Map<string, OldChunkEmb>>();
    const pgChunkMap =
      vb === "postgres" ? await loadPostgresChunkVectorsByPaths(normPaths) : new Map();
    const embedConfig = resolveEmbeddingConfig();

    type PlannedChunk = {
      id: string;
      ordinal: number;
      charStart: number;
      charEnd: number;
      text: string;
      contentSha256: string;
      floatVec: Float32Array | null;
      embeddingModel: string | null;
    };

    const planned: {
      doc: (typeof documents)[0];
      path: string;
      plan: ReturnType<typeof planVaultMarkdownChunks>;
      chunks: PlannedChunk[];
    }[] = [];

    const toEmbedTexts: string[] = [];
    const toEmbedRef: { pi: number; ci: number }[] = [];

    for (let pi = 0; pi < documents.length; pi++) {
      const doc = documents[pi]!;
      const path = doc.path.replace(/\\/g, "/");
      const plan = planVaultMarkdownChunks(doc.text);
      const oldMap = oldEmbByPath.get(path) ?? new Map<string, OldChunkEmb>();
      const chunks: PlannedChunk[] = [];

      for (const c of plan.chunks) {
        const id = vaultChunkId(path, CHUNK_STRATEGY_PARAGRAPH_V1, c.ordinal, c.contentSha256);

        if (embedConfig) {
          if (vb === "sqlite") {
            const prev = oldMap.get(id);
            if (prev && prev.model === embedConfig.model) {
              chunks.push({
                id,
                ordinal: c.ordinal,
                charStart: c.charStart,
                charEnd: c.charEnd,
                text: c.text,
                contentSha256: c.contentSha256,
                floatVec: blobToFloat32Array(prev.blob),
                embeddingModel: embedConfig.model,
              });
              continue;
            }
          } else if (vb === "postgres") {
            const prev = pgChunkMap.get(id);
            if (prev && prev.model === embedConfig.model) {
              chunks.push({
                id,
                ordinal: c.ordinal,
                charStart: c.charStart,
                charEnd: c.charEnd,
                text: c.text,
                contentSha256: c.contentSha256,
                floatVec: prev.vector,
                embeddingModel: embedConfig.model,
              });
              continue;
            }
          }
          toEmbedTexts.push(c.text);
          toEmbedRef.push({ pi: planned.length, ci: chunks.length });
          chunks.push({
            id,
            ordinal: c.ordinal,
            charStart: c.charStart,
            charEnd: c.charEnd,
            text: c.text,
            contentSha256: c.contentSha256,
            floatVec: null,
            embeddingModel: null,
          });
          continue;
        }

        chunks.push({
          id,
          ordinal: c.ordinal,
          charStart: c.charStart,
          charEnd: c.charEnd,
          text: c.text,
          contentSha256: c.contentSha256,
          floatVec: null,
          embeddingModel: null,
        });
      }

      planned.push({ doc, path, plan, chunks });
    }

    if (embedConfig && toEmbedTexts.length > 0) {
      try {
        const { vectors, model } = await embedTexts(toEmbedTexts, embedConfig);
        for (let i = 0; i < toEmbedRef.length; i++) {
          const ref = toEmbedRef[i]!;
          const vec = vectors[i];
          if (!vec) continue;
          const row = planned[ref.pi]!.chunks[ref.ci]!;
          row.floatVec = vec;
          row.embeddingModel = model;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[clawql-mcp] memory.db embedding sync failed: ${msg}`);
      }
    }

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const delEdges = db.prepare("DELETE FROM wikilink_edge WHERE from_path = ?");
    const insEdge = db.prepare(
      `INSERT OR REPLACE INTO wikilink_edge (from_path, to_target, to_resolved_path) VALUES (?, ?, ?)`
    );

    let artifactPayload: MemoryArtifactPayload = { cuckooBlob: null, merkle: null };
    db.run("BEGIN");
    try {
      for (const { doc, path, plan, chunks } of planned) {
        const bodySha = sha256Utf8(doc.text);
        const byteLen = Buffer.byteLength(doc.text, "utf8");
        const title = extractTitle(doc.text);

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

        const dualVecToSqlite = vectorDualWriteToMemoryDb();
        for (const c of chunks) {
          const embBlob = dualVecToSqlite && c.floatVec ? float32ArrayToBlob(c.floatVec) : null;
          const embModel = dualVecToSqlite && c.floatVec ? c.embeddingModel : null;
          insChunk.run([
            c.id,
            path,
            c.ordinal,
            c.charStart,
            c.charEnd,
            c.text,
            c.contentSha256,
            plan.strategy,
            embModel,
            embBlob,
          ]);
        }

        for (const target of extractWikilinkTargets(doc.text)) {
          const slug = slugifyTitle(target);
          const resolved = slugMap.get(slug) ?? null;
          insEdge.run([path, target, resolved]);
        }
      }
      artifactPayload = rebuildSqliteMemoryArtifacts(db);
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

    await syncMemoryArtifactsToPostgres(artifactPayload.cuckooBlob, artifactPayload.merkle);

    if (vb === "postgres" && embedConfig) {
      try {
        await upsertPostgresChunkVectors(
          planned.map((p) => ({
            path: p.path,
            chunks: p.chunks.map((c) => ({
              id: c.id,
              text: c.text,
              floatVec: c.floatVec,
              embeddingModel: c.embeddingModel,
            })),
          }))
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[clawql-mcp] postgres vector sync failed: ${msg}`);
      }
    }
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

/** Load chunk rows with non-null embeddings for `memory_recall` vector KNN. */
export async function loadChunkEmbeddingsForDocuments(
  vaultRoot: string,
  documentPaths: string[]
): Promise<ChunkWithEmbedding[]> {
  if (!memoryDbSyncEnabled() || documentPaths.length === 0) return [];
  const absDb = resolveMemoryDatabasePath(vaultRoot);
  const db = await openOrCreateDb(absDb);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const out: ChunkWithEmbedding[] = [];
    const batch = 400;
    for (let i = 0; i < documentPaths.length; i += batch) {
      const slice = documentPaths.slice(i, i + batch);
      if (slice.length === 0) continue;
      const placeholders = slice.map(() => "?").join(",");
      const stmt = db.prepare(
        `SELECT document_path, chunk_id, text, embedding FROM vault_chunk WHERE embedding IS NOT NULL AND document_path IN (${placeholders})`
      );
      stmt.bind(slice);
      while (stmt.step()) {
        const row = stmt.getAsObject() as {
          document_path: string;
          chunk_id: string;
          text: string;
          embedding: Uint8Array;
        };
        const emb = blobToFloat32Array(new Uint8Array(row.embedding));
        if (emb.length === 0) continue;
        out.push({
          documentPath: row.document_path,
          chunkId: row.chunk_id,
          text: row.text,
          embedding: emb,
        });
      }
      stmt.free();
    }
    return out;
  } finally {
    db.close();
  }
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

/**
 * When **`CLAWQL_CUCKOO_ENABLED=1`**, returns whether `chunk_id` might be in the indexed set
 * (no false negatives for indexed ids; false positives possible). Otherwise **`null`**.
 */
export async function chunkIdMaybeInMemoryIndex(
  vaultRoot: string,
  chunkId: string
): Promise<boolean | null> {
  if (process.env.CLAWQL_CUCKOO_ENABLED !== "1") return null;
  if (!memoryDbSyncEnabled()) return null;
  const absDb = resolveMemoryDatabasePath(vaultRoot);
  const db = await openOrCreateDb(absDb);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const stmt = db.prepare(
      "SELECT filter_blob FROM clawql_cuckoo_chunk_membership WHERE id = 1 LIMIT 1"
    );
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as { filter_blob?: Uint8Array };
    stmt.free();
    const blob = row.filter_blob;
    if (!blob || blob.byteLength === 0) return null;
    const filter = CuckooFilter.deserialize(new Uint8Array(blob));
    return filter.maybeContains(chunkId);
  } finally {
    db.close();
  }
}

/** Latest Merkle snapshot row from `memory.db`, if present. */
export async function loadVaultMerkleSnapshotFromDb(
  vaultRoot: string
): Promise<{ rootHex: string; leafCount: number; treeHeight: number; builtAt: string } | null> {
  if (!memoryDbSyncEnabled()) return null;
  const absDb = resolveMemoryDatabasePath(vaultRoot);
  const db = await openOrCreateDb(absDb);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    const stmt = db.prepare(
      "SELECT root_hex, leaf_count, tree_height, built_at FROM vault_merkle_snapshot WHERE id = 1 LIMIT 1"
    );
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as {
      root_hex: string;
      leaf_count: number;
      tree_height: number;
      built_at: string;
    };
    stmt.free();
    return {
      rootHex: row.root_hex,
      leafCount: Number(row.leaf_count),
      treeHeight: Number(row.tree_height),
      builtAt: row.built_at,
    };
  } finally {
    db.close();
  }
}
