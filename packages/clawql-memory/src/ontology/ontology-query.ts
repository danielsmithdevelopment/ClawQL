/**
 * Structured predicate queries against ontology.db for memory_recall.
 * Spec: docs/specs/memory/memory-recall-structured-filter-v0.1.md
 */

import { readVaultTextFile } from "../vault/utils.js";
import { stripVaultFrontmatter } from "../vault/markdown.js";
import type { FieldConfidence } from "./clawql-fields.js";
import {
  countMatters,
  openOntologyDb,
  ontologyDbEnabled,
  queryMattersSql,
  type MatterRow,
} from "./ontology-db.js";
import { syncOntologyMattersFromVault } from "./ontology-sync.js";

export type OntologySchema =
  | "legal.Matter"
  | "legal.Client"
  | "legal.Attorney"
  | "legal.Document";

export type FilterPredicate = Record<string, unknown>;
export type OntologyFilter = Record<string, FilterPredicate>;

export type OntologyOrderBy = { field: string; direction: "asc" | "desc" };

export type OntologyRecallInput = {
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

const MATTER_COLUMNS: Record<string, string> = {
  id: "m.id",
  title: "m.title",
  status: "m.status",
  practiceArea: "m.practice_area",
  matterType: "m.matter_type",
  dealValueUSD: "m.deal_value_usd",
  escrowPct: "m.escrow_pct",
  escrowDurationMonths: "m.escrow_duration_months",
  nonCompeteMonths: "m.non_compete_months",
  nonCompeteGeography: "m.non_compete_geography",
  client: "m.client_id",
  clientId: "m.client_id",
};

function confidenceLevelsAtOrAbove(minimum: FieldConfidence): FieldConfidence[] {
  const hierarchy: FieldConfidence[] = ["EXTRACTED", "INFERRED", "AMBIGUOUS"];
  const idx = hierarchy.indexOf(minimum);
  return hierarchy.slice(0, idx < 0 ? 1 : idx + 1);
}

function buildPredicate(
  col: string,
  predicate: FilterPredicate,
  values: unknown[]
): string | null {
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
    const col = MATTER_COLUMNS[field];
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
    // Fields with no confidence row are treated as EXTRACTED.
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

export async function runOntologyRecall(
  vault: string,
  input: OntologyRecallInput
): Promise<OntologyRecallResult | { ok: false; error: string }> {
  if (!ontologyDbEnabled()) {
    return {
      ok: false,
      error: "Ontology index disabled (CLAWQL_ONTOLOGY_DB=0) or vault not configured.",
    };
  }
  if (input.schema !== "legal.Matter") {
    return {
      ok: false,
      error: `Structured ontology query for schema '${input.schema}' is not implemented yet (Phase 1: legal.Matter only).`,
    };
  }
  if (!input.filters || Object.keys(input.filters).length === 0) {
    return { ok: false, error: "filters are required for structured ontology recall" };
  }

  const handle = await openOntologyDb(vault);
  if (!handle) {
    return { ok: false, error: "Could not open ontology.db" };
  }

  try {
    if (countMatters(handle.db) === 0) {
      await syncOntologyMattersFromVault(vault, handle);
    }

    const confidenceMinimum = input.confidenceMinimum ?? "EXTRACTED";
    const { where, values } = buildMatterWhereClause(input.filters, confidenceMinimum);
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
