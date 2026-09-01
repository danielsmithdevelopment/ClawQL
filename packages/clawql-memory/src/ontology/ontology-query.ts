/**
 * Structured predicate queries against ontology.db for memory_recall.
 * Spec: docs/specs/memory/memory-recall-structured-filter-v0.1.md
 *
 * `query` remains required by the MCP contract (backward compatible). In structured
 * mode it is an audit/logging hint — filters drive retrieval.
 */

import { readVaultTextFile } from "../vault/utils.js";
import { stripVaultFrontmatter } from "../vault/markdown.js";
import type { FieldConfidence } from "./clawql-fields.js";
import { MATTER_FILTER_COLUMNS, LEGAL_SCHEMA_FILTER_COLUMNS } from "./field-map.js";
import {
  countLegalEntities,
  openOntologyDb,
  ontologyDbEnabled,
  ontologyDbExplicitlyDisabled,
  queryLegalEntitiesSql,
  queryMattersSql,
  type MatterRow,
} from "./ontology-db.js";
import { ensureOntologyLegalEntitiesIndexed } from "./ontology-sync.js";
import { countDynamicRecords, getDynamicEntity, listDynamicRecords } from "./ontology-dynamic.js";
import { matchDynamicFilters } from "./dynamic-filter.js";

export type OntologySchema = string;

export const LEGAL_ONTOLOGY_SCHEMAS = [
  "legal.Matter",
  "legal.Client",
  "legal.Attorney",
  "legal.Document",
] as const;

export type LegalOntologySchema = (typeof LEGAL_ONTOLOGY_SCHEMAS)[number];

export function isLegalOntologySchema(schema: string): schema is LegalOntologySchema {
  return (LEGAL_ONTOLOGY_SCHEMAS as readonly string[]).includes(schema);
}

export function isDynamicOntologySchema(schema: string): boolean {
  return !schema.startsWith("legal.");
}

export type FilterPredicate = Record<string, unknown>;
export type OntologyFilter = Record<string, FilterPredicate>;

export type OntologyOrderBy = { field: string; direction: "asc" | "desc" };

export type OntologyRecallInput = {
  /** Required MCP field — audit/logging hint in structured mode (does not drive filters). */
  query: string;
  schema: OntologySchema;
  filters: OntologyFilter;
  confidenceMinimum?: FieldConfidence;
  limit?: number;
  orderBy?: OntologyOrderBy[];
};

export type OntologyRecallHit = {
  path: string;
  score: number;
  snippet: string;
  entityId: string;
  entityType: string;
  fields: Record<string, unknown>;
  confidence?: FieldConfidence;
  extractionMethod?: string;
};

export type OntologyRecallResult = {
  ok: true;
  query: string;
  hits: OntologyRecallHit[];
  /** Backward-compatible vault results shape (path/score/snippet). */
  results: Array<{
    path: string;
    score: number;
    depth: number;
    /** Structured recalls use `structured_predicate`; never mislabel as keyword. */
    reason: "structured_predicate" | "keyword";
    snippet: string;
  }>;
  queryType: "structured_predicate";
  indexUsed: "ontology";
  schema: OntologySchema;
  filters: OntologyFilter;
  scannedEntities: number;
  filteredEntities: number;
  confidenceMinimum: FieldConfidence;
  sourcesUsed: ["vault"];
};

export type OntologyRecallErrorType =
  | "ontology_disabled"
  | "ontology_unsupported_schema"
  | "ontology_invalid_filters"
  | "ontology_open_failed";

export type OntologyRecallFailure = {
  ok: false;
  error: string;
  errorType: OntologyRecallErrorType;
};

function confidenceLevelsAtOrAbove(minimum: FieldConfidence): FieldConfidence[] {
  const hierarchy: FieldConfidence[] = ["EXTRACTED", "INFERRED", "AMBIGUOUS"];
  const idx = hierarchy.indexOf(minimum);
  return hierarchy.slice(0, idx < 0 ? 1 : idx + 1);
}

function buildPredicate(col: string, predicate: FilterPredicate, values: unknown[]): string | null {
  if ("eq" in predicate) {
    values.push(predicate.eq);
    return `${col} = ?`;
  }
  if ("ne" in predicate) {
    values.push(predicate.ne);
    return `${col} != ?`;
  }
  if ("gte" in predicate) {
    values.push(predicate.gte);
    return `${col} >= ?`;
  }
  if ("gt" in predicate) {
    values.push(predicate.gt);
    return `${col} > ?`;
  }
  if ("lte" in predicate) {
    values.push(predicate.lte);
    return `${col} <= ?`;
  }
  if ("lt" in predicate) {
    values.push(predicate.lt);
    return `${col} < ?`;
  }
  if (
    "between" in predicate &&
    Array.isArray(predicate.between) &&
    predicate.between.length === 2
  ) {
    values.push(predicate.between[0], predicate.between[1]);
    return `${col} BETWEEN ? AND ?`;
  }
  if ("in" in predicate && Array.isArray(predicate.in)) {
    const placeholders = predicate.in.map(() => "?").join(", ");
    values.push(...predicate.in);
    return `${col} IN (${placeholders})`;
  }
  if ("nin" in predicate && Array.isArray(predicate.nin)) {
    const placeholders = predicate.nin.map(() => "?").join(", ");
    values.push(...predicate.nin);
    return `${col} NOT IN (${placeholders})`;
  }
  if ("contains" in predicate) {
    values.push(`%${String(predicate.contains)}%`);
    return `LOWER(${col}) LIKE LOWER(?)`;
  }
  if ("startsWith" in predicate) {
    values.push(`${String(predicate.startsWith)}%`);
    return `LOWER(${col}) LIKE LOWER(?)`;
  }
  if ("isNull" in predicate) {
    return predicate.isNull ? `${col} IS NULL` : `${col} IS NOT NULL`;
  }
  return null;
}

export function buildLegalWhereClause(
  filters: OntologyFilter,
  columnMap: Readonly<Record<string, string>>
): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const [field, predicate] of Object.entries(filters)) {
    const col = columnMap[field];
    if (!col || !predicate || typeof predicate !== "object") {
      throw new Error(`Unsupported ontology filter field: ${field}`);
    }
    const clause = buildPredicate(col, predicate, values);
    if (!clause) {
      throw new Error(`Unsupported ontology filter predicate on ${field}`);
    }
    clauses.push(clause);
  }

  return {
    where: clauses.length > 0 ? clauses.join(" AND ") : "1=1",
    values,
  };
}

export function buildMatterWhereClause(
  filters: OntologyFilter,
  confidenceMinimum?: FieldConfidence
): { where: string; values: unknown[] } {
  const { where: baseWhere, values } = buildLegalWhereClause(filters, MATTER_FILTER_COLUMNS);
  const clauses = [baseWhere];

  if (confidenceMinimum) {
    const levels = confidenceLevelsAtOrAbove(confidenceMinimum);
    const placeholders = levels.map(() => "?").join(", ");
    clauses.push(
      `(
        NOT EXISTS (
          SELECT 1 FROM field_confidence fc
          WHERE fc.entity_type = 'Matter' AND fc.entity_id = m.id AND fc.field_name = 'escrowPct'
        )
        OR EXISTS (
          SELECT 1 FROM field_confidence fc
          WHERE fc.entity_type = 'Matter' AND fc.entity_id = m.id AND fc.field_name = 'escrowPct'
            AND fc.confidence IN (${placeholders})
        )
      )`
    );
    values.push(...levels);
  }

  return {
    where: clauses.length > 0 ? clauses.join(" AND ") : "1=1",
    values,
  };
}

function rowToFields(row: MatterRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    practiceArea: row.practiceArea,
    matterType: row.matterType,
    dealValueUSD: row.dealValueUSD,
    escrowPct: row.escrowPct,
    escrowDurationMonths: row.escrowDurationMonths,
    nonCompeteMonths: row.nonCompeteMonths,
    nonCompeteGeography: row.nonCompeteGeography,
    clientId: row.clientId,
  };
}

async function snippetFor(vault: string, path: string): Promise<string> {
  try {
    const text = await readVaultTextFile(vault, path);
    return stripVaultFrontmatter(text).slice(0, 280).trim() + "…";
  } catch {
    return "";
  }
}

const LEGAL_ENTITY_TYPE: Record<LegalOntologySchema, string> = {
  "legal.Matter": "Matter",
  "legal.Client": "Client",
  "legal.Attorney": "Attorney",
  "legal.Document": "Document",
};

export {
  ensureOntologyMattersIndexed,
  ensureOntologyLegalEntitiesIndexed,
} from "./ontology-sync.js";

async function runLegalLayerOneRecall(
  vault: string,
  input: OntologyRecallInput & { schema: LegalOntologySchema }
): Promise<OntologyRecallResult | OntologyRecallFailure> {
  if (!input.filters || Object.keys(input.filters).length === 0) {
    return {
      ok: false,
      error: "filters are required for structured ontology recall",
      errorType: "ontology_invalid_filters",
    };
  }

  await ensureOntologyLegalEntitiesIndexed(vault, input.schema);

  const handle = await openOntologyDb(vault);
  if (!handle) {
    return {
      ok: false,
      error: "Could not open ontology.db",
      errorType: "ontology_open_failed",
    };
  }

  try {
    const confidenceMinimum = input.confidenceMinimum ?? "EXTRACTED";
    const limit = input.limit ?? 20;
    const scannedEntities = countLegalEntities(handle.db, input.schema);
    const entityType = LEGAL_ENTITY_TYPE[input.schema];

    let where: string;
    let values: unknown[];
    try {
      if (input.schema === "legal.Matter") {
        ({ where, values } = buildMatterWhereClause(input.filters, confidenceMinimum));
      } else {
        const columnMap = LEGAL_SCHEMA_FILTER_COLUMNS[input.schema];
        if (!columnMap) {
          return {
            ok: false,
            error: `Unsupported legal schema '${input.schema}'`,
            errorType: "ontology_unsupported_schema",
          };
        }
        ({ where, values } = buildLegalWhereClause(input.filters, columnMap));
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorType: "ontology_invalid_filters",
      };
    }

    const hits: OntologyRecallHit[] = [];

    if (input.schema === "legal.Matter") {
      const rows = queryMattersSql(handle.db, where, values, limit);
      for (const row of rows) {
        const snippet = await snippetFor(vault, row.vaultNotePath);
        hits.push({
          path: row.vaultNotePath,
          score: 1,
          snippet,
          entityId: row.id,
          entityType,
          fields: rowToFields(row),
          confidence: row.confidence,
          extractionMethod: row.extractionMethod,
        });
      }
    } else {
      const rows = queryLegalEntitiesSql(handle.db, input.schema, where, values, limit);
      for (const row of rows) {
        const { vaultNotePath, ...fields } = row;
        const snippet = vaultNotePath ? await snippetFor(vault, vaultNotePath) : "";
        hits.push({
          path: vaultNotePath || `ontology://legal/${input.schema}/${fields.id}`,
          score: 1,
          snippet,
          entityId: String(fields.id),
          entityType,
          fields,
          confidence: "EXTRACTED",
          extractionMethod: "machine_readable",
        });
      }
    }

    return {
      ok: true,
      query: input.query,
      hits,
      results: hits.map((h) => ({
        path: h.path,
        score: h.score,
        depth: 0,
        reason: "structured_predicate" as const,
        snippet: h.snippet,
      })),
      queryType: "structured_predicate",
      indexUsed: "ontology",
      schema: input.schema,
      filters: input.filters,
      scannedEntities,
      filteredEntities: hits.length,
      confidenceMinimum,
      sourcesUsed: ["vault"],
    };
  } finally {
    handle.close();
  }
}

async function runDynamicOntologyRecall(
  vault: string,
  input: OntologyRecallInput
): Promise<OntologyRecallResult | OntologyRecallFailure> {
  const handle = await openOntologyDb(vault);
  if (!handle) {
    return {
      ok: false,
      error: "Could not open ontology.db",
      errorType: "ontology_open_failed",
    };
  }

  try {
    const entity = getDynamicEntity(handle.db, input.schema);
    if (!entity) {
      return {
        ok: false,
        error: `Unknown dynamic ontology schema '${input.schema}' (register via Layer 2 scaffold / syncDynamicOntologyDocument)`,
        errorType: "ontology_unsupported_schema",
      };
    }

    const filters = input.filters ?? {};
    const knownFields = new Set([
      ...entity.fields.map((f) => f.name),
      ...(entity.relationships ?? []).map((r) => r.name),
      "id",
    ]);
    for (const field of Object.keys(filters)) {
      if (!knownFields.has(field)) {
        return {
          ok: false,
          error: `Unsupported ontology filter field: ${field}`,
          errorType: "ontology_invalid_filters",
        };
      }
    }

    const confidenceMinimum = input.confidenceMinimum ?? "EXTRACTED";
    const limit = input.limit ?? 20;
    const scannedEntities = countDynamicRecords(handle.db, input.schema);
    const rows = listDynamicRecords(handle.db, input.schema);
    const matched = rows.filter((row) => matchDynamicFilters(row.fields, filters)).slice(0, limit);

    const hits: OntologyRecallHit[] = [];
    for (const row of matched) {
      const path = row.vaultNotePath ?? `ontology://dynamic/${input.schema}/${row.recordId}`;
      const snippet = row.vaultNotePath ? await snippetFor(vault, row.vaultNotePath) : "";
      hits.push({
        path,
        score: 1,
        snippet,
        entityId: row.recordId,
        entityType: input.schema,
        fields: row.fields,
        confidence: "EXTRACTED",
        extractionMethod: entity.source,
      });
    }

    return {
      ok: true,
      query: input.query,
      hits,
      results: hits.map((h) => ({
        path: h.path,
        score: h.score,
        depth: 0,
        reason: "structured_predicate" as const,
        snippet: h.snippet,
      })),
      queryType: "structured_predicate",
      indexUsed: "ontology",
      schema: input.schema,
      filters,
      scannedEntities,
      filteredEntities: hits.length,
      confidenceMinimum,
      sourcesUsed: ["vault"],
    };
  } finally {
    handle.close();
  }
}

export async function runOntologyRecall(
  vault: string,
  input: OntologyRecallInput
): Promise<OntologyRecallResult | OntologyRecallFailure> {
  if (ontologyDbExplicitlyDisabled()) {
    return {
      ok: false,
      error: "CLAWQL_ONTOLOGY_DB=0; ontology.db sync disabled",
      errorType: "ontology_disabled",
    };
  }
  if (!ontologyDbEnabled()) {
    return {
      ok: false,
      error: "CLAWQL_ONTOLOGY_DB disabled or vault not configured (set CLAWQL_OBSIDIAN_VAULT_PATH)",
      errorType: "ontology_disabled",
    };
  }
  if (isDynamicOntologySchema(input.schema)) {
    return runDynamicOntologyRecall(vault, input);
  }

  if (isLegalOntologySchema(input.schema)) {
    return runLegalLayerOneRecall(vault, { ...input, schema: input.schema });
  }

  return {
    ok: false,
    error: `Unknown ontology schema '${input.schema}'`,
    errorType: "ontology_unsupported_schema",
  };
}

/** True when recall should take the structured ontology path. */
export function wantsStructuredOntologyRecall(input: {
  schema?: string;
  filters?: OntologyFilter;
}): boolean {
  if (!input.schema) return false;
  // Dynamic Layer 2/3 schemas may enumerate with empty filters (return all rows).
  if (isDynamicOntologySchema(input.schema)) return true;
  return Boolean(input.filters && Object.keys(input.filters).length > 0);
}
