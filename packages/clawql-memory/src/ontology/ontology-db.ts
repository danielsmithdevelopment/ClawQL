/**
 * Colocated SQLite `ontology.db` for structured legal (and future) entity indexes.
 * Spec: docs/specs/ontology/legal-domain-v0.1.md §4
 *
 * Uses sql.js (WASM) like memory.db so installs work with npm ci --ignore-scripts.
 */

import { createRequire } from "node:module";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { getObsidianVaultPath } from "../vault/config.js";
import { resolveVaultPath } from "../vault/utils.js";
import type {
  ExtractedMatter,
  ExtractedClient,
  ExtractedAttorney,
  ExtractedDocument,
  FieldConfidence,
  MatterFields,
} from "./clawql-fields.js";
import {
  matterFieldsFromSqlRow,
  clientFieldsFromSqlRow,
  attorneyFieldsFromSqlRow,
  documentFieldsFromSqlRow,
} from "./field-map.js";
import { migrateDynamicOntologyTables } from "./ontology-dynamic.js";

const SCHEMA_VERSION = 2;
const INGEST_VERSION = "legal-domain-v0.1";
const ONTOLOGY_LOCK_NAME = ".clawql-ontology-write.lock";
const LOCK_POLL_MS = 50;
const LOCK_MAX_ATTEMPTS = 200;

/** In-process mutex so concurrent recalls share one lazy-sync (sql.js is not multi-writer safe). */
const ontologyLocks = new Map<string, Promise<unknown>>();

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function loadSqlJs(): Promise<ReturnType<typeof initSqlJs>> {
  if (sqlJsPromise) return sqlJsPromise;
  const require = createRequire(import.meta.url);
  const sqlEntry = require.resolve("sql.js");
  const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
  sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  return sqlJsPromise;
}

export function ontologyDbEnabled(): boolean {
  if (process.env.CLAWQL_ONTOLOGY_DB === "0") return false;
  return getObsidianVaultPath() !== null;
}

/** True when the operator explicitly disabled ontology.db (`CLAWQL_ONTOLOGY_DB=0`). */
export function ontologyDbExplicitlyDisabled(): boolean {
  return process.env.CLAWQL_ONTOLOGY_DB === "0";
}

export function resolveOntologyDatabasePath(vaultRoot: string): string {
  const raw = process.env.CLAWQL_ONTOLOGY_DB_PATH?.trim();
  if (raw && isAbsolute(raw)) return raw;
  const rel = (raw || "ontology.db").replace(/\\/g, "/").replace(/^\/+/, "");
  return resolveVaultPath(vaultRoot, rel);
}

/**
 * Exclusive cooperative lock for ontology.db writes / lazy vault sync.
 * Combines an on-disk lock (cross-process) with an in-process queue (same event loop).
 */
export async function withOntologyWriteLock<T>(
  vaultRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = resolveOntologyDatabasePath(vaultRoot);
  const prev = ontologyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => gate);
  ontologyLocks.set(key, chained);

  await prev.catch(() => undefined);

  const lockPath = resolveVaultPath(vaultRoot, ONTOLOGY_LOCK_NAME);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    await mkdir(dirname(lockPath), { recursive: true });
    for (let i = 0; i < LOCK_MAX_ATTEMPTS; i++) {
      try {
        handle = await open(lockPath, "wx");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
      }
    }
    if (!handle) {
      throw new Error(
        `Ontology write lock timeout after ${LOCK_MAX_ATTEMPTS * LOCK_POLL_MS}ms: ${lockPath}`
      );
    }
    return await fn();
  } finally {
    if (handle) {
      await handle.close();
      try {
        await unlink(lockPath);
      } catch {
        /* ignore */
      }
    }
    release();
    if (ontologyLocks.get(key) === chained) {
      ontologyLocks.delete(key);
    }
  }
}

function isoNow(): string {
  return new Date().toISOString();
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
      CREATE TABLE matters (
        id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT,
        practice_area TEXT,
        matter_type TEXT,
        deal_value_usd INTEGER,
        escrow_pct REAL,
        escrow_duration_months INTEGER,
        non_compete_months INTEGER,
        non_compete_geography TEXT,
        client_id TEXT,
        supervision_partner_id TEXT,
        opened_date TEXT,
        closed_date TEXT,
        vault_note_path TEXT NOT NULL,
        last_ingested_at TEXT NOT NULL,
        ingest_version TEXT NOT NULL
      );
      CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT,
        industry TEXT,
        tier TEXT,
        vault_note_path TEXT
      );
      CREATE TABLE attorneys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        title TEXT,
        vault_note_path TEXT
      );
      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        document_type TEXT,
        matter_id TEXT REFERENCES matters(id),
        status TEXT,
        vault_note_path TEXT
      );
      CREATE TABLE matter_related_matters (
        matter_id TEXT REFERENCES matters(id),
        related_matter_id TEXT REFERENCES matters(id),
        PRIMARY KEY (matter_id, related_matter_id)
      );
      CREATE TABLE field_confidence (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        confidence TEXT NOT NULL,
        extraction_method TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id, field_name)
      );
      CREATE INDEX idx_matters_escrow ON matters(escrow_pct);
      CREATE INDEX idx_matters_nc_months ON matters(non_compete_months);
      CREATE INDEX idx_matters_client ON matters(client_id);
      CREATE INDEX idx_matters_practice ON matters(practice_area);
      CREATE INDEX idx_matters_status ON matters(status);
    `);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'legal_v0_1', ?)",
      [isoNow()]
    );
  }

  if (v < 2) {
    migrateDynamicOntologyTables(db);
    db.run(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'dynamic_entities_v0_1', ?)",
      [isoNow()]
    );
  }
}

export type OntologyDbHandle = {
  db: Database;
  path: string;
  persist: () => Promise<void>;
  close: () => void;
};

export async function openOntologyDb(vaultRoot: string): Promise<OntologyDbHandle | null> {
  if (process.env.CLAWQL_ONTOLOGY_DB === "0") return null;
  const path = resolveOntologyDatabasePath(vaultRoot);
  await mkdir(dirname(path), { recursive: true });
  const SQL = await loadSqlJs();
  let db: Database;
  try {
    const buf = await readFile(path);
    db = new SQL.Database(buf);
  } catch {
    db = new SQL.Database();
  }
  migrate(db);

  const persist = async () => {
    const data = db.export();
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, Buffer.from(data));
    await rename(tmp, path);
  };

  return {
    db,
    path,
    persist,
    close: () => db.close(),
  };
}

export function countMatters(db: Database): number {
  const r = db.exec("SELECT COUNT(*) FROM matters");
  const cell = r[0]?.values[0]?.[0];
  return Number(cell) || 0;
}

function countTable(db: Database, table: string): number {
  const r = db.exec(`SELECT COUNT(*) FROM ${table}`);
  const cell = r[0]?.values[0]?.[0];
  return Number(cell) || 0;
}

export function countClients(db: Database): number {
  return countTable(db, "clients");
}

export function countAttorneys(db: Database): number {
  return countTable(db, "attorneys");
}

export function countDocuments(db: Database): number {
  return countTable(db, "documents");
}

export function countLegalEntities(db: Database, schema: string): number {
  switch (schema) {
    case "legal.Matter":
      return countMatters(db);
    case "legal.Client":
      return countClients(db);
    case "legal.Attorney":
      return countAttorneys(db);
    case "legal.Document":
      return countDocuments(db);
    default:
      return 0;
  }
}

export function upsertMatter(
  db: Database,
  extracted: ExtractedMatter,
  vaultNotePath: string,
  titleHint?: string
): void {
  const f = extracted.fields;
  const now = isoNow();
  db.run(
    `INSERT INTO matters (
      id, title, status, practice_area, matter_type, deal_value_usd, escrow_pct,
      escrow_duration_months, non_compete_months, non_compete_geography, client_id,
      vault_note_path, last_ingested_at, ingest_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      status=excluded.status,
      practice_area=excluded.practice_area,
      matter_type=excluded.matter_type,
      deal_value_usd=excluded.deal_value_usd,
      escrow_pct=excluded.escrow_pct,
      escrow_duration_months=excluded.escrow_duration_months,
      non_compete_months=excluded.non_compete_months,
      non_compete_geography=excluded.non_compete_geography,
      client_id=excluded.client_id,
      vault_note_path=excluded.vault_note_path,
      last_ingested_at=excluded.last_ingested_at,
      ingest_version=excluded.ingest_version`,
    [
      f.id,
      f.title ?? titleHint ?? f.id,
      f.status ?? null,
      f.practiceArea ?? null,
      f.matterType ?? null,
      f.dealValueUSD ?? null,
      f.escrowPct ?? null,
      f.escrowDurationMonths ?? null,
      f.nonCompeteMonths ?? null,
      f.nonCompeteGeography ?? null,
      f.clientId ?? null,
      vaultNotePath,
      now,
      INGEST_VERSION,
    ]
  );

  for (const [fieldName, meta] of Object.entries(extracted.fieldMeta)) {
    if (!meta) continue;
    db.run(
      `INSERT INTO field_confidence (entity_type, entity_id, field_name, confidence, extraction_method)
       VALUES ('Matter', ?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id, field_name) DO UPDATE SET
         confidence=excluded.confidence,
         extraction_method=excluded.extraction_method`,
      [f.id, fieldName, meta.confidence, meta.extractionMethod]
    );
  }
}

export function upsertClient(
  db: Database,
  extracted: ExtractedClient,
  vaultNotePath: string
): void {
  const f = extracted.fields;
  db.run(
    `INSERT INTO clients (id, name, short_name, industry, tier, vault_note_path)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       short_name=excluded.short_name,
       industry=excluded.industry,
       tier=excluded.tier,
       vault_note_path=excluded.vault_note_path`,
    [f.id, f.name, f.shortName ?? null, f.industry ?? null, f.tier ?? null, vaultNotePath]
  );
}

export function upsertAttorney(
  db: Database,
  extracted: ExtractedAttorney,
  vaultNotePath: string
): void {
  const f = extracted.fields;
  db.run(
    `INSERT INTO attorneys (id, name, title, vault_note_path)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name,
       title=excluded.title,
       vault_note_path=excluded.vault_note_path`,
    [f.id, f.name, f.title ?? null, vaultNotePath]
  );
}

export function upsertDocument(
  db: Database,
  extracted: ExtractedDocument,
  vaultNotePath: string
): void {
  const f = extracted.fields;
  db.run(
    `INSERT INTO documents (id, title, document_type, matter_id, status, vault_note_path)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title,
       document_type=excluded.document_type,
       matter_id=excluded.matter_id,
       status=excluded.status,
       vault_note_path=excluded.vault_note_path`,
    [f.id, f.title, f.documentType ?? null, f.matterId ?? null, f.status ?? null, vaultNotePath]
  );
}

export type MatterRow = MatterFields & {
  vaultNotePath: string;
  confidence?: FieldConfidence;
  extractionMethod?: string;
};

export function queryMattersSql(
  db: Database,
  whereSql: string,
  values: unknown[],
  limit: number
): MatterRow[] {
  const sql = `
    SELECT
      m.id, m.title, m.status, m.practice_area, m.matter_type, m.deal_value_usd,
      m.escrow_pct, m.escrow_duration_months, m.non_compete_months, m.non_compete_geography,
      m.client_id, m.vault_note_path,
      (
        SELECT fc.confidence FROM field_confidence fc
        WHERE fc.entity_type = 'Matter' AND fc.entity_id = m.id AND fc.field_name = 'escrowPct'
        LIMIT 1
      ) AS confidence,
      (
        SELECT fc.extraction_method FROM field_confidence fc
        WHERE fc.entity_type = 'Matter' AND fc.entity_id = m.id AND fc.field_name = 'escrowPct'
        LIMIT 1
      ) AS extraction_method
    FROM matters m
    WHERE ${whereSql}
    ORDER BY m.id ASC
    LIMIT ?
  `;
  const stmt = db.prepare(sql);
  stmt.bind([...values, limit] as Array<string | number | null | Uint8Array>);
  const rows: MatterRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    const fields = matterFieldsFromSqlRow(r);
    rows.push({
      ...fields,
      confidence: (r.confidence as FieldConfidence | null) ?? "EXTRACTED",
      extractionMethod:
        r.extraction_method != null ? String(r.extraction_method) : "machine_readable",
    });
  }
  stmt.free();
  return rows;
}

export type ClientRow = ReturnType<typeof clientFieldsFromSqlRow>;
export type AttorneyRow = ReturnType<typeof attorneyFieldsFromSqlRow>;
export type DocumentRow = ReturnType<typeof documentFieldsFromSqlRow>;

type LegalTableConfig = {
  table: string;
  alias: string;
  select: string;
  fromRow: (row: Record<string, unknown>) => Record<string, unknown> & { vaultNotePath: string };
};

const LEGAL_TABLE_CONFIG: Record<string, LegalTableConfig> = {
  "legal.Client": {
    table: "clients",
    alias: "c",
    select: "c.id, c.name, c.short_name, c.industry, c.tier, c.vault_note_path",
    fromRow: clientFieldsFromSqlRow,
  },
  "legal.Attorney": {
    table: "attorneys",
    alias: "a",
    select: "a.id, a.name, a.title, a.vault_note_path",
    fromRow: attorneyFieldsFromSqlRow,
  },
  "legal.Document": {
    table: "documents",
    alias: "d",
    select: "d.id, d.title, d.document_type, d.matter_id, d.status, d.vault_note_path",
    fromRow: documentFieldsFromSqlRow,
  },
};

export function queryLegalEntitiesSql(
  db: Database,
  schema: string,
  whereSql: string,
  values: unknown[],
  limit: number
): Array<Record<string, unknown> & { vaultNotePath: string }> {
  const cfg = LEGAL_TABLE_CONFIG[schema];
  if (!cfg) return [];
  const sql = `
    SELECT ${cfg.select}
    FROM ${cfg.table} ${cfg.alias}
    WHERE ${whereSql}
    ORDER BY ${cfg.alias}.id ASC
    LIMIT ?
  `;
  const stmt = db.prepare(sql);
  stmt.bind([...values, limit] as Array<string | number | null | Uint8Array>);
  const rows: Array<Record<string, unknown> & { vaultNotePath: string }> = [];
  while (stmt.step()) {
    rows.push(cfg.fromRow(stmt.getAsObject() as Record<string, unknown>));
  }
  stmt.free();
  return rows;
}
