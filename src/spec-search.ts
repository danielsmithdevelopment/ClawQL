/**
 * spec-search.ts
 *
 * Lightweight keyword search over the flattened Cloud Run operations.
 * Scores each operation against the query by matching against:
 *   - operation id segments (highest weight)
 *   - resource name
 *   - description
 *   - path
 *   - parameter names
 *
 * No embeddings needed at this scale (54 endpoints). Fast, zero-latency,
 * no extra tokens consumed for the search itself.
 */

import type { Operation } from "./spec-loader.js";

export interface SearchResult {
  operation: Operation;
  score: number;
  matchedOn: string[];
}

/**
 * Search operations by natural-language query.
 * Returns top `limit` results sorted by descending score.
 */
export function searchOperations(
  operations: Operation[],
  query: string,
  limit = 5
): SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const op of operations) {
    const { score, matchedOn } = scoreOperation(op, terms);
    if (score > 0) {
      results.push({ operation: op, score, matchedOn });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ─────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────

const WEIGHTS = {
  operationIdSegment: 6,  // e.g. "services", "create", "list"
  resourceName: 5,
  descriptionExact: 4,    // exact word in description
  path: 3,
  httpMethod: 3,          // "get", "post", "delete"…
  parameterName: 2,
  descriptionPartial: 1,
};

function scoreOperation(
  op: Operation,
  terms: string[]
): { score: number; matchedOn: string[] } {
  let score = 0;
  const matchedOn: string[] = [];

  const idSegments = op.id.toLowerCase().split(".");
  const descLower = op.description.toLowerCase();
  const pathLower = op.path.toLowerCase();
  const methodLower = op.method.toLowerCase();
  const paramNames = Object.keys(op.parameters).map((k) => k.toLowerCase());

  for (const term of terms) {
    // Operation ID segments
    if (idSegments.some((seg) => seg.includes(term))) {
      score += WEIGHTS.operationIdSegment;
      matchedOn.push(`id:${op.id}`);
    }

    // Resource name
    if (op.resource.toLowerCase().includes(term)) {
      score += WEIGHTS.resourceName;
      matchedOn.push(`resource:${op.resource}`);
    }

    // HTTP method
    if (methodLower === term) {
      score += WEIGHTS.httpMethod;
      matchedOn.push(`method:${op.method}`);
    }

    // Description (word boundary)
    const descWords = tokenize(descLower);
    if (descWords.includes(term)) {
      score += WEIGHTS.descriptionExact;
      matchedOn.push(`description`);
    } else if (descLower.includes(term)) {
      score += WEIGHTS.descriptionPartial;
      matchedOn.push(`description(partial)`);
    }

    // Path
    if (pathLower.includes(term)) {
      score += WEIGHTS.path;
      matchedOn.push(`path:${op.flatPath}`);
    }

    // Parameter names
    if (paramNames.some((p) => p.includes(term))) {
      score += WEIGHTS.parameterName;
      matchedOn.push(`param`);
    }
  }

  return { score, matchedOn: [...new Set(matchedOn)] };
}

// ─────────────────────────────────────────────
// Tokenizer — lowercases and splits on non-word chars
// Also handles camelCase and compound words
// ─────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Split camelCase and PascalCase words
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Split on anything non-alphanumeric
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1); // drop single-char noise
}

// ─────────────────────────────────────────────
// Formatter — shapes results for MCP tool response
// ─────────────────────────────────────────────

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return JSON.stringify({ results: [], message: "No matching operations found." });
  }

  return JSON.stringify(
    {
      results: results.map((r) => ({
        id: r.operation.id,
        method: r.operation.method,
        path: r.operation.flatPath,
        description: r.operation.description,
        resource: r.operation.resource,
        parameters: Object.entries(r.operation.parameters).map(
          ([name, p]) => ({
            name,
            location: p.location,
            required: p.required,
            type: p.type,
            description: p.description,
          })
        ),
        requestBody: r.operation.requestBody ?? null,
        responseSchema: r.operation.responseBody ?? null,
        score: r.score,
      })),
    },
    null,
    2
  );
}