/**
 * spec-search.ts
 *
 * Lightweight keyword search over Cloud Run / OpenAPI operations **and**
 * SkillIndexEntry rows (8.0 Skills-over-MCP — same ranking surface as tools).
 */

import { Effect } from "effect";
import type { SkillIndexEntry } from "clawql-core";
import type { DocSearchResult } from "../search/docs-index.js";
import type { Operation } from "./operation-types.js";

export interface OperationSearchResult {
  readonly kind: "operation";
  readonly operation: Operation;
  readonly score: number;
  readonly matchedOn: string[];
}

export interface SkillSearchResult {
  readonly kind: "skill";
  readonly skill: SkillIndexEntry;
  readonly score: number;
  readonly matchedOn: string[];
}

/** @deprecated Prefer {@link OperationSearchResult} — kept for call sites during migration. */
export type SearchResult = OperationSearchResult;

export type RankedSearchHit = OperationSearchResult | SkillSearchResult | DocSearchResult;

/** Whether the returned `results[]` includes every ranked match. */
export type SearchCatalogStatus = "complete" | "partial";

/** Per-source match totals (before shared limit truncation). */
export type SearchSourceCounts = {
  readonly operation: number;
  readonly skill: number;
  readonly doc: number;
};

/** Catalog completeness envelope for MCP `search` responses. */
export type SearchCatalogMeta = {
  readonly catalogStatus: SearchCatalogStatus;
  readonly matchedCount: number;
  readonly totalCount: number;
  readonly message: string;
  readonly countsBySource: SearchSourceCounts;
};

/**
 * Search operations by natural-language query.
 * Returns top `limit` results sorted by descending score.
 */
export function searchOperations(
  operations: Operation[],
  query: string,
  limit = 5
): OperationSearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const results: OperationSearchResult[] = [];

  for (const op of operations) {
    const { score, matchedOn } = scoreOperation(op, terms);
    if (score > 0) {
      results.push({ kind: "operation", operation: op, score, matchedOn });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

const SKILL_WEIGHTS = {
  skillId: 6,
  name: 5,
  descriptionExact: 4,
  descriptionPartial: 1,
  /** Floor so `applicability: always` skills stay candidates every pass (§8.5). */
  alwaysBase: 0.5,
};

/** Score a skill index entry against query terms. */
export function scoreSkillIndexEntry(
  entry: SkillIndexEntry,
  query: string
): { score: number; matchedOn: string[] } {
  const terms = tokenize(query);
  let score = 0;
  const matchedOn: string[] = [];

  const idLower = entry.skillId.toLowerCase();
  const nameLower = entry.name.toLowerCase();
  const descLower = entry.description.toLowerCase();
  const descWords = tokenize(descLower);

  if (terms.length === 0) {
    if (entry.applicability === "always") {
      return { score: SKILL_WEIGHTS.alwaysBase, matchedOn: ["applicability:always"] };
    }
    return { score: 0, matchedOn: [] };
  }

  for (const term of terms) {
    if (idLower.includes(term) || idLower.split(/[^a-z0-9]+/).includes(term)) {
      score += SKILL_WEIGHTS.skillId;
      matchedOn.push(`skillId:${entry.skillId}`);
    }
    if (nameLower.includes(term) || tokenize(nameLower).includes(term)) {
      score += SKILL_WEIGHTS.name;
      matchedOn.push(`name:${entry.name}`);
    }
    if (descWords.includes(term)) {
      score += SKILL_WEIGHTS.descriptionExact;
      matchedOn.push("description");
    } else if (descLower.includes(term)) {
      score += SKILL_WEIGHTS.descriptionPartial;
      matchedOn.push("description(partial)");
    }
  }

  if (entry.applicability === "always" && score === 0) {
    score = SKILL_WEIGHTS.alwaysBase;
    matchedOn.push("applicability:always");
  }

  return { score, matchedOn: [...new Set(matchedOn)] };
}

/**
 * Rank skills for inclusion in unified search.
 * - `always`: always a candidate (base score if no term match)
 * - `query-matched`: only when score > alwaysBase floor from real matches
 */
export function searchSkills(
  skills: readonly SkillIndexEntry[],
  query: string,
  limit = 5
): SkillSearchResult[] {
  const results: SkillSearchResult[] = [];
  for (const skill of skills) {
    const { score, matchedOn } = scoreSkillIndexEntry(skill, query);
    if (skill.applicability === "always") {
      if (score > 0) results.push({ kind: "skill", skill, score, matchedOn });
      continue;
    }
    if (score > SKILL_WEIGHTS.alwaysBase) {
      results.push({ kind: "skill", skill, score, matchedOn });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Merge operation + skill + doc hits, sort by score, apply shared limit. */
export function mergeRankedHits(
  operations: readonly OperationSearchResult[],
  skills: readonly SkillSearchResult[],
  limit: number,
  docs: readonly DocSearchResult[] = []
): RankedSearchHit[] {
  return [...operations, ...skills, ...docs].sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Build COMPLETE / PARTIAL catalog meta from returned vs total match counts.
 * `matchedCount` is what appears in `results[]`; `totalCount` is all ranked hits.
 */
export const buildSearchCatalogMetaEffect = (
  matchedCount: number,
  totalCount: number,
  countsBySource: SearchSourceCounts
): Effect.Effect<SearchCatalogMeta> =>
  Effect.sync(() => {
    const safeMatched = Math.max(0, matchedCount);
    const safeTotal = Math.max(safeMatched, totalCount);
    const catalogStatus: SearchCatalogStatus = safeMatched < safeTotal ? "partial" : "complete";
    const message =
      catalogStatus === "partial" ? `PARTIAL, ${safeMatched} of ${safeTotal}` : "COMPLETE";
    return {
      catalogStatus,
      matchedCount: safeMatched,
      totalCount: safeTotal,
      message,
      countsBySource,
    };
  });

/** Sync façade for tests / callers that already hold Effect at the boundary. */
export function buildSearchCatalogMeta(
  matchedCount: number,
  totalCount: number,
  countsBySource: SearchSourceCounts
): SearchCatalogMeta {
  return Effect.runSync(buildSearchCatalogMetaEffect(matchedCount, totalCount, countsBySource));
}

/**
 * Merge unlimited op/skill/doc hits, apply limit, and attach catalog completeness.
 */
export const mergeRankedHitsWithCatalogEffect = (
  operations: readonly OperationSearchResult[],
  skills: readonly SkillSearchResult[],
  limit: number,
  docs: readonly DocSearchResult[] = []
): Effect.Effect<{ readonly hits: RankedSearchHit[]; readonly catalog: SearchCatalogMeta }> =>
  Effect.gen(function* () {
    const totalOp = operations.length;
    const totalSkill = skills.length;
    const totalDoc = docs.length;
    const totalCount = totalOp + totalSkill + totalDoc;
    const hits = mergeRankedHits(operations, skills, limit, docs);
    const catalog = yield* buildSearchCatalogMetaEffect(hits.length, totalCount, {
      operation: totalOp,
      skill: totalSkill,
      doc: totalDoc,
    });
    return { hits, catalog };
  });

const WEIGHTS = {
  operationIdSegment: 6,
  resourceName: 5,
  descriptionExact: 4,
  path: 3,
  httpMethod: 3,
  parameterName: 2,
  descriptionPartial: 1,
};

function scoreOperation(op: Operation, terms: string[]): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  const idSegments = op.id.toLowerCase().split(".");
  const labelLower = op.specLabel?.toLowerCase() ?? "";
  const descLower = op.description.toLowerCase();
  const pathLower = op.path.toLowerCase();
  const methodLower = op.method.toLowerCase();
  const paramNames = Object.keys(op.parameters).map((k) => k.toLowerCase());

  for (const term of terms) {
    if (labelLower && labelLower.includes(term)) {
      score += WEIGHTS.operationIdSegment;
      matchedOn.push(`spec:${labelLower}`);
    }
    if (idSegments.some((seg) => seg.includes(term))) {
      score += WEIGHTS.operationIdSegment;
      matchedOn.push(`id:${op.id}`);
    }
    if (op.resource.toLowerCase().includes(term)) {
      score += WEIGHTS.resourceName;
      matchedOn.push(`resource:${op.resource}`);
    }
    if (methodLower === term) {
      score += WEIGHTS.httpMethod;
      matchedOn.push(`method:${op.method}`);
    }
    const descWords = tokenize(descLower);
    if (descWords.includes(term)) {
      score += WEIGHTS.descriptionExact;
      matchedOn.push(`description`);
    } else if (descLower.includes(term)) {
      score += WEIGHTS.descriptionPartial;
      matchedOn.push(`description(partial)`);
    }
    if (pathLower.includes(term)) {
      score += WEIGHTS.path;
      matchedOn.push(`path:${op.flatPath}`);
    }
    if (paramNames.some((p) => p.includes(term))) {
      score += WEIGHTS.parameterName;
      matchedOn.push(`param`);
    }
  }

  return { score, matchedOn: [...new Set(matchedOn)] };
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function mapHitForResponse(r: RankedSearchHit): Record<string, unknown> {
  if (r.kind === "skill") {
    return {
      kind: "skill" as const,
      skillId: r.skill.skillId,
      name: r.skill.name,
      description: r.skill.description,
      digest: r.skill.digest,
      pluginId: r.skill.pluginId,
      applicability: r.skill.applicability,
      source: r.skill.source,
      score: r.score,
      matchedOn: r.matchedOn,
      /** Fetch full body via MCP `skills_get`. */
      fetch: { tool: "skills_get", skillId: r.skill.skillId },
    };
  }
  if (r.kind === "doc") {
    const href = `${r.baseUrl.replace(/\/$/, "")}${r.url.startsWith("/") ? r.url : `/${r.url}`}`;
    return {
      kind: "doc" as const,
      url: r.url,
      href,
      title: r.title,
      pageTitle: r.pageTitle ?? null,
      score: r.score,
      matchedOn: r.matchedOn,
    };
  }
  const parameters = Object.entries(r.operation.parameters).map(([name, p]) => ({
    name,
    location: p.location,
    required: p.required,
    type: p.type,
    description: p.description,
  }));
  const paramSig = parameters
    .map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type ?? "unknown"}`)
    .join(", ");
  const signature = `${r.operation.method.toUpperCase()} ${r.operation.flatPath}(${paramSig})`;
  return {
    kind: "operation" as const,
    id: r.operation.id,
    method: r.operation.method,
    path: r.operation.flatPath,
    /** Typed call signature with parameter names/types for model-facing catalog UX. */
    signature,
    description: r.operation.description,
    resource: r.operation.resource,
    parameters,
    requestBody: r.operation.requestBody ?? null,
    responseSchema: r.operation.responseBody ?? null,
    score: r.score,
    specLabel: r.operation.specLabel ?? null,
    matchedOn: r.matchedOn,
    risk: r.operation.risk ?? null,
  };
}

/**
 * Format unified search hits for MCP tool response.
 * Includes catalog completeness (`COMPLETE` / `PARTIAL, N of M`) while keeping
 * a backward-compatible `results[]` array.
 */
export const formatSearchResultsEffect = (
  results: readonly RankedSearchHit[],
  catalog?: SearchCatalogMeta
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const countsBySource = catalog?.countsBySource ?? {
      operation: results.filter((r) => r.kind === "operation").length,
      skill: results.filter((r) => r.kind === "skill").length,
      doc: results.filter((r) => r.kind === "doc").length,
    };
    const meta =
      catalog ??
      (yield* buildSearchCatalogMetaEffect(results.length, results.length, countsBySource));

    if (results.length === 0) {
      return JSON.stringify({
        catalogStatus: "complete" satisfies SearchCatalogStatus,
        matchedCount: 0,
        totalCount: meta.totalCount,
        countsBySource: meta.countsBySource,
        message: "No matching operations, skills, or docs found.",
        results: [],
      });
    }

    return JSON.stringify(
      {
        catalogStatus: meta.catalogStatus,
        matchedCount: meta.matchedCount,
        totalCount: meta.totalCount,
        countsBySource: meta.countsBySource,
        message: meta.message,
        results: results.map(mapHitForResponse),
      },
      null,
      2
    );
  });

/** Sync façade — prefer {@link formatSearchResultsEffect} inside Effect programs. */
export function formatSearchResults(
  results: readonly RankedSearchHit[],
  catalog?: SearchCatalogMeta
): string {
  return Effect.runSync(formatSearchResultsEffect(results, catalog));
}
