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
import { MATTER_FILTER_COLUMNS } from "./field-map.js";
import {
  countMatters,
  openOntologyDb,
  ontologyDbEnabled,
  ontologyDbExplicitlyDisabled,
  queryMattersSql,
  withOntologyWriteLock,
  type MatterRow,
} from "./ontology-db.js";
import { syncOntologyMattersFromVault } from "./ontology-sync.js";

export type OntologySchema = "legal.Matter" | "legal.Client" | "legal.Attorney" | "legal.Document";

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
    reason: "keyword";
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
  if ("between" in predicate && Array.isArray(predicate.between) && predicate.between.length === 2) {
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

export function buildMatterWhereClause(
  filters: OntologyFilter,
  confidenceMinimum?: FieldConfidence
): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];

  for (const [field, predicate] of Object.entries(filters)) {
    const col = MATTER_FILTER_COLUMNS[field];
    if (!col || !predicate || typeof predicate !== "object") {
      throw new Error(`Unsupported ontology filter field: ${field}`);
    }
    const clause = buildPredicate(col, predicate, values);
    if (!clause) {
      throw new Error(`Unsupported ontology filter predicate on ${field}`);
    }
    clauses.push(clause);
  }

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

/**
 * Double-checked lazy sync under ontology write lock — safe for concurrent
 * schema+filters recalls hitting an empty matters table.
 */
export async function ensureOntologyMattersIndexed(vault: string): Promise<void> {
  {
    const probe = await openOntologyDb(vault);
    if (!probe) return;
    try {
      if (countMatters(probe.db) > 0) return;
    } finally {
      probe.close();
    }
  }

  await withOntologyWriteLock(vault, async () => {
    const handle = await openOntologyDb(vault);
    if (!handle) return;
    try {
      if (countMatters(handle.db) > 0) return;
      await syncOntologyMattersFromVault(vault, handle);
    } finally {
      handle.close();
    }
  });
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
  if (input.schema !== "legal.Matter") {
    return {
      ok: false,
      error: `Structured ontology query for schema '${input.schema}' is not implemented yet (Phase 1: legal.Matter only).`,
      errorType: "ontology_unsupported_schema",
    };
  }
  if (!input.filters || Object.keys(input.filters).length === 0) {
    return {
      ok: false,
      error: "filters are required for structured ontology recall",
      errorType: "ontology_invalid_filters",
    };
  }

  await ensureOntologyMattersIndexed(vault);

  const handle = await openOntologyDb(vault);
  if (!handle) {
    return {
      ok: false,
      error: "Could not open ontology.db",
      errorType: "ontology_open_failed",
    };
  }

  try {
    let where: string;
    let values: unknown[];
    try {
      const confidenceMinimum = input.confidenceMinimum ?? "EXTRACTED";
      ({ where, values } = buildMatterWhereClause(input.filters, confidenceMinimum));
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        errorType: "ontology_invalid_filters",
      };
    }

    const confidenceMinimum = input.confidenceMinimum ?? "EXTRACTED";
    const limit = input.limit ?? 20;
    const scannedEntities = countMatters(handle.db);
    const rows = queryMattersSql(handle.db, where, values, limit);

    const hits: OntologyRecallHit[] = [];
    for (const row of rows) {
      const snippet = await snippetFor(vault, row.vaultNotePath);
      hits.push({
        path: row.vaultNotePath,
        score: 1,
        snippet,
        entityId: row.id,
        entityType: "Matter",
        fields: rowToFields(row),
        confidence: row.confidence,
        extractionMethod: row.extractionMethod,
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
        reason: "keyword" as const,
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

/** True when recall should take the structured ontology path. */
export function wantsStructuredOntologyRecall(input: {
  schema?: string;
  filters?: OntologyFilter;
}): boolean {
  return Boolean(input.schema && input.filters && Object.keys(input.filters).length > 0);
}
