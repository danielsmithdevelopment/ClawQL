/**
 * Dynamic (Layer 2/3) entity definitions + instance rows in ontology.db.
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md
 */

import type { Database } from "sql.js";

type SqlValue = number | string | Uint8Array | null;

export type DynamicFieldDef = {
  name: string;
  type: string;
  nullable?: boolean;
  description?: string;
};

export type DynamicRelationshipDef = {
  name: string;
  type: string;
  targetEntity: string;
  description?: string;
};

export type DynamicEntityDef = {
  id: string;
  source: string;
  fields: DynamicFieldDef[];
  relationships?: DynamicRelationshipDef[];
  documentType?: string;
  ttl?: string | number;
  sourceHash?: string;
  vaultNotePath?: string;
};

export type DynamicRecordRow = {
  entityId: string;
  recordId: string;
  fields: Record<string, unknown>;
  vaultNotePath?: string;
};

function isoNow(): string {
  return new Date().toISOString();
}

function queryOne(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): Record<string, SqlValue> | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.free();
  return row;
}

function queryAll(db: Database, sql: string, params: SqlValue[] = []): Record<string, SqlValue>[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: Record<string, SqlValue>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Apply SCHEMA_VERSION 2 tables (idempotent CREATE IF NOT EXISTS). */
export function migrateDynamicOntologyTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dynamic_entities (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      relationships_json TEXT NOT NULL DEFAULT '[]',
      document_type TEXT,
      ttl TEXT,
      registered_at TEXT NOT NULL,
      expires_at TEXT,
      vault_note_path TEXT,
      source_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS dynamic_records (
      entity_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      fields_json TEXT NOT NULL,
      vault_note_path TEXT,
      last_ingested_at TEXT NOT NULL,
      PRIMARY KEY (entity_id, record_id),
      FOREIGN KEY (entity_id) REFERENCES dynamic_entities(id)
    );
    CREATE INDEX IF NOT EXISTS idx_dynamic_records_entity ON dynamic_records(entity_id);
  `);
}

export function upsertDynamicEntity(db: Database, entity: DynamicEntityDef): void {
  const now = isoNow();
  const ttl = entity.ttl === undefined || entity.ttl === null ? null : String(entity.ttl);
  db.run(
    `INSERT INTO dynamic_entities(
      id, source, fields_json, relationships_json, document_type, ttl,
      registered_at, expires_at, vault_note_path, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      source = excluded.source,
      fields_json = excluded.fields_json,
      relationships_json = excluded.relationships_json,
      document_type = excluded.document_type,
      ttl = excluded.ttl,
      vault_note_path = excluded.vault_note_path,
      source_hash = excluded.source_hash`,
    [
      entity.id,
      entity.source,
      JSON.stringify(entity.fields ?? []),
      JSON.stringify(entity.relationships ?? []),
      entity.documentType ?? null,
      ttl,
      now,
      entity.vaultNotePath ?? null,
      entity.sourceHash ?? null,
    ]
  );
}

export function getDynamicEntity(db: Database, entityId: string): DynamicEntityDef | null {
  const row = queryOne(
    db,
    `SELECT id, source, fields_json, relationships_json, document_type, ttl, vault_note_path, source_hash
     FROM dynamic_entities WHERE id = ?`,
    [entityId]
  );
  if (!row) return null;
  return {
    id: String(row.id),
    source: String(row.source),
    fields: JSON.parse(String(row.fields_json || "[]")) as DynamicFieldDef[],
    relationships: JSON.parse(String(row.relationships_json || "[]")) as DynamicRelationshipDef[],
    documentType: row.document_type != null ? String(row.document_type) : undefined,
    ttl: row.ttl != null ? String(row.ttl) : undefined,
    vaultNotePath: row.vault_note_path != null ? String(row.vault_note_path) : undefined,
    sourceHash: row.source_hash != null ? String(row.source_hash) : undefined,
  };
}

export function upsertDynamicRecord(
  db: Database,
  entityId: string,
  recordId: string,
  fields: Record<string, unknown>,
  vaultNotePath?: string
): void {
  db.run(
    `INSERT INTO dynamic_records(entity_id, record_id, fields_json, vault_note_path, last_ingested_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entity_id, record_id) DO UPDATE SET
       fields_json = excluded.fields_json,
       vault_note_path = COALESCE(excluded.vault_note_path, dynamic_records.vault_note_path),
       last_ingested_at = excluded.last_ingested_at`,
    [entityId, recordId, JSON.stringify(fields), vaultNotePath ?? null, isoNow()]
  );
}

export function listDynamicRecords(db: Database, entityId: string): DynamicRecordRow[] {
  const rows = queryAll(
    db,
    `SELECT entity_id, record_id, fields_json, vault_note_path FROM dynamic_records WHERE entity_id = ?`,
    [entityId]
  );
  return rows.map((r) => ({
    entityId: String(r.entity_id),
    recordId: String(r.record_id),
    fields: JSON.parse(String(r.fields_json || "{}")) as Record<string, unknown>,
    vaultNotePath: r.vault_note_path != null ? String(r.vault_note_path) : undefined,
  }));
}

export function countDynamicRecords(db: Database, entityId: string): number {
  const row = queryOne(db, `SELECT COUNT(*) AS c FROM dynamic_records WHERE entity_id = ?`, [
    entityId,
  ]);
  return Number(row?.c ?? 0);
}

export function hasDynamicEntity(db: Database, entityId: string): boolean {
  return getDynamicEntity(db, entityId) !== null;
}
