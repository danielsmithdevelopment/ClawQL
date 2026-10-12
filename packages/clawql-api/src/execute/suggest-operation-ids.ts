/**
 * Fix-named hints when execute receives an unknown operationId.
 */

import { Effect } from "effect";

/** Max suggestions returned with an unknown-operationId error. */
export const UNKNOWN_OPERATION_SUGGESTION_LIMIT = 5;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

function sharedPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Higher is better. Prefers substring / shared path segments, then edit distance.
 */
export function scoreOperationIdSuggestion(needle: string, candidate: string): number {
  const n = needle.toLowerCase();
  const c = candidate.toLowerCase();
  if (!n || !c) return 0;
  if (n === c) return 10_000;
  let score = 0;
  if (c.includes(n) || n.includes(c)) score += 500 + Math.min(n.length, c.length);
  score += sharedPrefixLen(n, c) * 8;
  const nSegs = new Set(n.split(/[^a-z0-9]+/).filter(Boolean));
  const cSegs = c.split(/[^a-z0-9]+/).filter(Boolean);
  for (const seg of cSegs) {
    if (nSegs.has(seg)) score += 40;
  }
  const dist = levenshtein(n, c);
  const maxLen = Math.max(n.length, c.length);
  score += Math.max(0, 80 - dist * (maxLen > 40 ? 2 : 4));
  return score;
}

/**
 * Rank catalog operationIds closest to an unknown id (for fix-named errors).
 */
export const suggestClosestOperationIdsEffect = (
  unknownId: string,
  operationIds: readonly string[],
  limit = UNKNOWN_OPERATION_SUGGESTION_LIMIT
): Effect.Effect<readonly string[]> =>
  Effect.sync(() => {
    const needle = unknownId.trim();
    if (!needle || operationIds.length === 0 || limit < 1) return [];
    return [...operationIds]
      .map((id) => ({ id, score: scoreOperationIdSuggestion(needle, id) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((row) => row.id);
  });

export function suggestClosestOperationIds(
  unknownId: string,
  operationIds: readonly string[],
  limit = UNKNOWN_OPERATION_SUGGESTION_LIMIT
): readonly string[] {
  return Effect.runSync(suggestClosestOperationIdsEffect(unknownId, operationIds, limit));
}

/** JSON body for unknown operationId MCP text (includes closest suggestions when any). */
export const unknownOperationIdErrorEffect = (
  operationId: string,
  operationIds: readonly string[]
): Effect.Effect<Record<string, unknown>> =>
  Effect.gen(function* () {
    const suggestions = yield* suggestClosestOperationIdsEffect(operationId, operationIds);
    const base = `Unknown operationId: "${operationId}". Use search() to find valid operation IDs.`;
    if (suggestions.length === 0) {
      return { error: base, fix: "Call search with a short keyword from the API you need." };
    }
    return {
      error: base,
      suggestions: [...suggestions],
      fix: `Did you mean one of: ${suggestions.join(", ")}? Or call search() with a related keyword.`,
    };
  });
