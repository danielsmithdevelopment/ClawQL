/**
 * Colocated SQLite `ontology.db` for structured legal (and future) entity indexes.
 * Spec: docs/specs/ontology/legal-domain-v0.1.md §4
 *
 * Uses sql.js (WASM) like memory.db so installs work with npm ci --ignore-scripts.
 */

import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { getObsidianVaultPath } from "../vault/config.js";
import { resolveVaultPath } from "../vault/utils.js";
import type { ExtractedMatter, FieldConfidence, MatterFields } from "./clawql-fields.js";

const SCHEMA_VERSION = 1;
const INGEST_VERSION = "legal-domain-v0.1";

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

export function resolveOntologyDatabasePath(vaultRoot: string): string {
  const raw = process.env.CLAWQL_ONTOLOGY_DB_PATH?.trim();
  if (raw && isAbsolute(raw)) return raw;
  const rel = (raw || "ontology.db").replace(/\\/g, "/").replace(/^\/+/, "");
  return resolveVaultPath(vaultRoot, rel);
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
  stmt.bind([...values, limit]);
  const rows: MatterRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>;
    rows.push({
      id: String(r.id),
      title: r.title != null ? String(r.title) : undefined,
      status: r.status != null ? String(r.status) : undefined,
      practiceArea: r.practice_area != null ? String(r.practice_area) : undefined,
      matterType: r.matter_type != null ? String(r.matter_type) : undefined,
      dealValueUSD: r.deal_value_usd != null ? Number(r.deal_value_usd) : undefined,
      escrowPct: r.escrow_pct != null ? Number(r.escrow_pct) : undefined,
      escrowDurationMonths:
        r.escrow_duration_months != null ? Number(r.escrow_duration_months) : undefined,
      nonCompeteMonths: r.non_compete_months != null ? Number(r.non_compete_months) : undefined,
      nonCompeteGeography:
        r.non_compete_geography != null ? String(r.non_compete_geography) : undefined,
      clientId: r.client_id != null ? String(r.client_id) : undefined,
      vaultNotePath: String(r.vault_note_path),
      confidence: (r.confidence as FieldConfidence | null) ?? "EXTRACTED",
      extractionMethod:
        r.extraction_method != null ? String(r.extraction_method) : "machine_readable",
    });
  }
  stmt.free();
  return rows;
}
