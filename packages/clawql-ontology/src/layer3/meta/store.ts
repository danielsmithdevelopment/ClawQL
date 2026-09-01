/**
 * Layer 3 — meta-ontology SQLite store (sql.js).
 * Spec: docs/specs/ontology/meta-ontology-v0.1.md §5.3
 */
import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Context, Effect, Layer } from "effect";
import initSqlJs, { type Database } from "sql.js";

type SqlValue = number | string | Uint8Array | null;
import { OntologyError, ontologyFromPromise } from "../../effect/ontology-errors.js";
import { readOntologyMetaConfig } from "../../effect/ontology-meta-config.js";
import { sha256Hex } from "../../shared/crypto-hash.js";
import type {
  CQEEntity,
  FailurePattern,
  FieldReliability,
  QueryGoal,
  QueryPattern,
} from "../../shared/cqe-runtime-types.js";
import type { EntityObservation, FieldObservation, OBTRecord, QueryObservation } from "./types.js";

const META_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_reliability (
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT '',
  extraction_count INTEGER DEFAULT 0,
  null_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (entity_id, field_name, document_type)
);

CREATE TABLE IF NOT EXISTS query_patterns (
  entity_id TEXT NOT NULL,
  filter_signature TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  success_count INTEGER DEFAULT 0,
  attempt_count INTEGER DEFAULT 0,
  avg_result_count REAL DEFAULT 0,
  avg_criterion_pass_rate REAL DEFAULT 0,
  goal TEXT,
  last_used TEXT NOT NULL,
  PRIMARY KEY (entity_id, filter_signature)
);

CREATE TABLE IF NOT EXISTS learned_entities (
  document_type TEXT PRIMARY KEY,
  entity_json TEXT NOT NULL,
  evidence_count INTEGER DEFAULT 0,
  avg_criterion_pass_rate REAL DEFAULT 0,
  promoted_to_layer1 INTEGER DEFAULT 0,
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS failure_patterns (
  entity_id TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  pattern_description TEXT NOT NULL,
  occurrence_count INTEGER DEFAULT 0,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (entity_id, pattern_type, pattern_description)
);
`;

let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null;

async function loadSqlJs(): Promise<Awaited<ReturnType<typeof initSqlJs>>> {
  if (!sqlJsPromise) {
    // tsup CJS empties import.meta.url — fall back to cwd package.json for resolve.
    const metaUrl = typeof import.meta !== "undefined" && import.meta.url ? import.meta.url : "";
    const require = createRequire(metaUrl || join(process.cwd(), "package.json"));
    const sqlEntry = require.resolve("sql.js");
    const wasmPath = join(dirname(sqlEntry), "sql-wasm.wasm");
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlJsPromise;
}

function isoNow(): string {
  return new Date().toISOString();
}

async function openDb(path: string): Promise<Database> {
  const SQL = await loadSqlJs();
  try {
    const buf = await readFile(path);
    return new SQL.Database(buf);
  } catch {
    return new SQL.Database();
  }
}

async function persistDb(db: Database, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const data = db.export();
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, Buffer.from(data));
  await rename(tmp, path);
}

function migrate(db: Database): void {
  db.exec(META_SCHEMA);
  const cur = db.exec("SELECT MAX(version) AS v FROM schema_migrations");
  const cell = cur[0]?.values[0]?.[0];
  const v = cell === null || cell === undefined ? 0 : Number(cell);
  if (!Number.isFinite(v) || v < 1) {
    db.run("INSERT OR REPLACE INTO schema_migrations(version, name, applied_at) VALUES (1, ?, ?)", [
      "meta-ontology-v0.1",
      isoNow(),
    ]);
  }
}

function reliabilityScore(extractionCount: number, successCount: number): number {
  if (extractionCount <= 0) return 0;
  return successCount / extractionCount;
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

export type LearnedEntityRow = {
  document_type: string;
  entity_json: string;
  evidence_count: number;
  avg_criterion_pass_rate: number;
  promoted_to_layer1: number;
};

export class MetaOntologyStoreService extends Context.Tag("clawql/MetaOntologyStoreService")<
  MetaOntologyStoreService,
  {
    readonly updateFieldReliability: (obs: FieldObservation) => Effect.Effect<void, OntologyError>;
    readonly getFieldReliability: (
      entityId: string,
      fieldName: string,
      documentType?: string
    ) => Effect.Effect<FieldReliability | null, OntologyError>;
    readonly updateQueryPattern: (obs: QueryObservation) => Effect.Effect<void, OntologyError>;
    readonly getBestQueryPattern: (
      entityId: string,
      goal: QueryGoal
    ) => Effect.Effect<QueryPattern | null, OntologyError>;
    readonly updateEntity: (obs: EntityObservation) => Effect.Effect<void, OntologyError>;
    readonly getLearnedEntity: (
      documentType: string
    ) => Effect.Effect<LearnedEntityRow | null, OntologyError>;
    readonly learnFailurePattern: (obt: OBTRecord) => Effect.Effect<void, OntologyError>;
    readonly getFailurePatterns: (
      entityId: string
    ) => Effect.Effect<FailurePattern[], OntologyError>;
    readonly listLearnedEntities: () => Effect.Effect<LearnedEntityRow[], OntologyError>;
    readonly markPromoted: (documentType: string) => Effect.Effect<void, OntologyError>;
    readonly statusSummary: () => Effect.Effect<
      {
        documentTypes: number;
        totalEvidence: number;
        promotionCandidates: number;
        dbPath: string;
      },
      OntologyError
    >;
  }
>() {}

type StoreDeps = {
  dbPath: string;
  maxPatterns: number;
  promotionEvidence: number;
  promotionQuality: number;
};

function withDb<A>(
  deps: StoreDeps,
  fn: (db: Database) => A | Promise<A>
): Effect.Effect<A, OntologyError> {
  return ontologyFromPromise(async () => {
    const db = await openDb(deps.dbPath);
    try {
      migrate(db);
      const result = await fn(db);
      await persistDb(db, deps.dbPath);
      return result;
    } finally {
      db.close();
    }
  });
}

export function makeMetaOntologyStoreLive(
  overrides: Partial<StoreDeps> = {}
): Layer.Layer<MetaOntologyStoreService> {
  const cfg = Effect.runSync(readOntologyMetaConfig());
  const deps: StoreDeps = {
    dbPath: overrides.dbPath ?? cfg.metaDbPath,
    maxPatterns: overrides.maxPatterns ?? cfg.maxPatterns,
    promotionEvidence: overrides.promotionEvidence ?? cfg.promotionEvidence,
    promotionQuality: overrides.promotionQuality ?? cfg.promotionQuality,
  };

  return Layer.succeed(
    MetaOntologyStoreService,
    MetaOntologyStoreService.of({
      updateFieldReliability: (obs) =>
        withDb(deps, (db) => {
          const docType = obs.documentType ?? "";
          const row = queryOne(
            db,
            `SELECT extraction_count, null_count, success_count FROM field_reliability
             WHERE entity_id = ? AND field_name = ? AND document_type = ?`,
            [obs.entityId, obs.fieldName, docType]
          );
          let extraction = Number(row?.extraction_count ?? 0);
          let nullCount = Number(row?.null_count ?? 0);
          let success = Number(row?.success_count ?? 0);
          extraction += 1;
          if (obs.wasNull) nullCount += 1;
          if (obs.wasExtracted && (obs.contributedToPass ?? true)) success += 1;
          db.run(
            `INSERT INTO field_reliability(entity_id, field_name, document_type, extraction_count, null_count, success_count, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(entity_id, field_name, document_type) DO UPDATE SET
               extraction_count = excluded.extraction_count,
               null_count = excluded.null_count,
               success_count = excluded.success_count,
               last_updated = excluded.last_updated`,
            [obs.entityId, obs.fieldName, docType, extraction, nullCount, success, isoNow()]
          );
        }),

      getFieldReliability: (entityId, fieldName, documentType = "") =>
        withDb(deps, (db) => {
          const row = queryOne(
            db,
            `SELECT entity_id, field_name, document_type, extraction_count, null_count, success_count
             FROM field_reliability WHERE entity_id = ? AND field_name = ? AND document_type = ?`,
            [entityId, fieldName, documentType]
          );
          if (!row) return null;
          const extractionCount = Number(row.extraction_count ?? 0);
          const successCount = Number(row.success_count ?? 0);
          return {
            entityId: String(row.entity_id),
            fieldName: String(row.field_name),
            documentType: String(row.document_type || "") || null,
            extractionCount,
            nullCount: Number(row.null_count ?? 0),
            successCount,
            reliabilityScore: reliabilityScore(extractionCount, successCount),
          } satisfies FieldReliability;
        }),

      updateQueryPattern: (obs) =>
        Effect.gen(function* () {
          const signature = yield* sha256Hex(JSON.stringify(obs.filters));
          yield* withDb(deps, (db) => {
            const existing = queryOne(
              db,
              `SELECT success_count, attempt_count, avg_result_count, avg_criterion_pass_rate
               FROM query_patterns WHERE entity_id = ? AND filter_signature = ?`,
              [obs.entityId, signature]
            );
            let success = Number(existing?.success_count ?? 0);
            let attempts = Number(existing?.attempt_count ?? 0);
            let avgResults = Number(existing?.avg_result_count ?? 0);
            let avgCpr = Number(existing?.avg_criterion_pass_rate ?? 0);
            attempts += 1;
            if (obs.contributed) success += 1;
            avgResults = (avgResults * (attempts - 1) + obs.resultCount) / attempts;
            avgCpr = (avgCpr * (attempts - 1) + obs.criterionPassRate) / attempts;
            db.run(
              `INSERT INTO query_patterns(entity_id, filter_signature, filter_json, success_count, attempt_count, avg_result_count, avg_criterion_pass_rate, goal, last_used)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(entity_id, filter_signature) DO UPDATE SET
                 filter_json = excluded.filter_json,
                 success_count = excluded.success_count,
                 attempt_count = excluded.attempt_count,
                 avg_result_count = excluded.avg_result_count,
                 avg_criterion_pass_rate = excluded.avg_criterion_pass_rate,
                 goal = COALESCE(excluded.goal, query_patterns.goal),
                 last_used = excluded.last_used`,
              [
                obs.entityId,
                signature,
                JSON.stringify(obs.filters),
                success,
                attempts,
                avgResults,
                avgCpr,
                obs.goal ?? null,
                isoNow(),
              ]
            );
            const countRow = queryOne(
              db,
              `SELECT COUNT(*) AS c FROM query_patterns WHERE entity_id = ?`,
              [obs.entityId]
            );
            const count = Number(countRow?.c ?? 0);
            if (count > deps.maxPatterns) {
              const excess = count - deps.maxPatterns;
              const toDelete = queryAll(
                db,
                `SELECT filter_signature FROM query_patterns
                 WHERE entity_id = ?
                 ORDER BY success_count ASC, last_used ASC
                 LIMIT ?`,
                [obs.entityId, excess]
              );
              for (const d of toDelete) {
                db.run(`DELETE FROM query_patterns WHERE entity_id = ? AND filter_signature = ?`, [
                  obs.entityId,
                  String(d.filter_signature),
                ]);
              }
            }
          });
        }),

      getBestQueryPattern: (entityId, goal) =>
        withDb(deps, (db) => {
          const row = queryOne(
            db,
            `SELECT entity_id, filter_signature, filter_json, success_count, attempt_count,
                    avg_result_count, avg_criterion_pass_rate, goal
             FROM query_patterns
             WHERE entity_id = ? AND (goal = ? OR goal IS NULL)
             ORDER BY success_count DESC, avg_criterion_pass_rate DESC
             LIMIT 1`,
            [entityId, goal]
          );
          if (!row) return null;
          return {
            entityId: String(row.entity_id),
            filterSignature: String(row.filter_signature),
            filters: JSON.parse(String(row.filter_json)) as Record<string, unknown>,
            successCount: Number(row.success_count ?? 0),
            attemptCount: Number(row.attempt_count ?? 0),
            avgResultCount: Number(row.avg_result_count ?? 0),
            avgCriterionPassRate: Number(row.avg_criterion_pass_rate ?? 0),
            goal: (row.goal as QueryGoal | null) ?? goal,
          } satisfies QueryPattern;
        }),

      updateEntity: (obs) =>
        withDb(deps, (db) => {
          const existing = queryOne(
            db,
            `SELECT entity_json, evidence_count, avg_criterion_pass_rate FROM learned_entities WHERE document_type = ?`,
            [obs.documentType]
          );
          let evidence = 0;
          let avgCpr = 0;
          let entity: CQEEntity = {
            ...obs.entity,
            documentType: obs.documentType,
            source: "meta_ontology",
          };
          if (existing) {
            evidence = Number(existing.evidence_count ?? 0);
            avgCpr = Number(existing.avg_criterion_pass_rate ?? 0);
            try {
              const prev = JSON.parse(String(existing.entity_json)) as CQEEntity;
              const fieldNames = new Set(prev.fields.map((f) => f.name));
              for (const f of obs.entity.fields) {
                if (!fieldNames.has(f.name)) prev.fields.push(f);
              }
              entity = {
                ...prev,
                ...obs.entity,
                fields: prev.fields,
                relationships: obs.entity.relationships.length
                  ? obs.entity.relationships
                  : prev.relationships,
                documentType: obs.documentType,
                source: "meta_ontology",
              };
            } catch {
              /* use obs.entity */
            }
          }
          evidence += 1;
          avgCpr = (avgCpr * (evidence - 1) + obs.criterionPassRate) / evidence;
          entity.evidenceCount = evidence;
          entity.avgCriterionPassRate = avgCpr;
          db.run(
            `INSERT INTO learned_entities(document_type, entity_json, evidence_count, avg_criterion_pass_rate, promoted_to_layer1, last_updated)
             VALUES (?, ?, ?, ?, 0, ?)
             ON CONFLICT(document_type) DO UPDATE SET
               entity_json = excluded.entity_json,
               evidence_count = excluded.evidence_count,
               avg_criterion_pass_rate = excluded.avg_criterion_pass_rate,
               last_updated = excluded.last_updated`,
            [obs.documentType, JSON.stringify(entity), evidence, avgCpr, isoNow()]
          );
        }),

      getLearnedEntity: (documentType) =>
        withDb(deps, (db) => {
          const row = queryOne(
            db,
            `SELECT document_type, entity_json, evidence_count, avg_criterion_pass_rate, promoted_to_layer1
             FROM learned_entities WHERE document_type = ?`,
            [documentType]
          );
          if (!row) return null;
          return {
            document_type: String(row.document_type),
            entity_json: String(row.entity_json),
            evidence_count: Number(row.evidence_count ?? 0),
            avg_criterion_pass_rate: Number(row.avg_criterion_pass_rate ?? 0),
            promoted_to_layer1: Number(row.promoted_to_layer1 ?? 0),
          } satisfies LearnedEntityRow;
        }),

      learnFailurePattern: (obt) =>
        withDb(deps, (db) => {
          const entityId = obt.taskMeta?.entityId ?? obt.taskMeta?.documentType ?? "unknown";
          const cpr = obt.verdict?.criterionPassRate ?? 0;
          const description =
            cpr < 0.5 ? `low_criterion_pass_rate:${cpr.toFixed(2)}` : "unspecified_failure";
          const patternType = cpr < 0.25 ? "wrong_strategy" : "null_fields";
          const existing = queryOne(
            db,
            `SELECT occurrence_count FROM failure_patterns
             WHERE entity_id = ? AND pattern_type = ? AND pattern_description = ?`,
            [entityId, patternType, description]
          );
          const count = Number(existing?.occurrence_count ?? 0) + 1;
          db.run(
            `INSERT INTO failure_patterns(entity_id, pattern_type, pattern_description, occurrence_count, last_seen)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(entity_id, pattern_type, pattern_description) DO UPDATE SET
               occurrence_count = excluded.occurrence_count,
               last_seen = excluded.last_seen`,
            [entityId, patternType, description, count, isoNow()]
          );
        }),

      getFailurePatterns: (entityId) =>
        withDb(deps, (db) => {
          const rows = queryAll(
            db,
            `SELECT entity_id, pattern_type, pattern_description, occurrence_count, last_seen
             FROM failure_patterns WHERE entity_id = ? ORDER BY occurrence_count DESC`,
            [entityId]
          );
          return rows.map(
            (v) =>
              ({
                entityId: String(v.entity_id),
                patternType: String(v.pattern_type),
                patternDescription: String(v.pattern_description),
                occurrenceCount: Number(v.occurrence_count ?? 0),
                lastSeen: String(v.last_seen),
              }) satisfies FailurePattern
          );
        }),

      listLearnedEntities: () =>
        withDb(deps, (db) => {
          const rows = queryAll(
            db,
            `SELECT document_type, entity_json, evidence_count, avg_criterion_pass_rate, promoted_to_layer1
             FROM learned_entities ORDER BY evidence_count DESC`
          );
          return rows.map(
            (v) =>
              ({
                document_type: String(v.document_type),
                entity_json: String(v.entity_json),
                evidence_count: Number(v.evidence_count ?? 0),
                avg_criterion_pass_rate: Number(v.avg_criterion_pass_rate ?? 0),
                promoted_to_layer1: Number(v.promoted_to_layer1 ?? 0),
              }) satisfies LearnedEntityRow
          );
        }),

      markPromoted: (documentType) =>
        withDb(deps, (db) => {
          db.run(
            `UPDATE learned_entities SET promoted_to_layer1 = 1, last_updated = ? WHERE document_type = ?`,
            [isoNow(), documentType]
          );
        }),

      statusSummary: () =>
        withDb(deps, (db) => {
          const docs = queryOne(
            db,
            `SELECT COUNT(*) AS document_types, COALESCE(SUM(evidence_count), 0) AS total_evidence FROM learned_entities`
          );
          const cand = queryOne(
            db,
            `SELECT COUNT(*) AS c FROM learned_entities
             WHERE evidence_count >= ? AND avg_criterion_pass_rate >= ? AND promoted_to_layer1 = 0`,
            [deps.promotionEvidence, deps.promotionQuality]
          );
          return {
            documentTypes: Number(docs?.document_types ?? 0),
            totalEvidence: Number(docs?.total_evidence ?? 0),
            promotionCandidates: Number(cand?.c ?? 0),
            dbPath: deps.dbPath,
          };
        }),
    })
  );
}

/** Default live layer (reads env for db path). */
export const MetaOntologyStoreLive = makeMetaOntologyStoreLive();

export function runWithMetaStore<A, E>(
  effect: Effect.Effect<A, E, MetaOntologyStoreService>,
  overrides: Partial<StoreDeps> = {}
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.provide(makeMetaOntologyStoreLive(overrides))) as Effect.Effect<A, E>
  );
}

export function metaStoreLayerForPath(dbPath: string): Layer.Layer<MetaOntologyStoreService> {
  return makeMetaOntologyStoreLive({ dbPath });
}

export { reliabilityScore };
