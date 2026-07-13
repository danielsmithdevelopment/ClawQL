/**
 * Core `search` implementation — keyword search over loaded operations.
 * Optional `loadSpecFn` supports tests and MCP overrides.
 */

import { Effect } from "effect";
import { loadSpec } from "../spec/spec-loader.js";
import { formatSearchResults, searchOperations } from "../spec/spec-search.js";
import type { SearchInput, SearchOutput } from "../search-service.js";

export type LoadSpecFn = typeof loadSpec;

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Shared search body as an Effect program — returns formatted MCP text. */
export function searchClawqlOperationsEffect(
  params: SearchInput,
  loadSpecFn: LoadSpecFn = loadSpec
): Effect.Effect<SearchOutput, Error> {
  return Effect.gen(function* () {
    const { operations } = yield* fromPromise(() => loadSpecFn());
    const results = searchOperations(operations, params.query, params.limit ?? 5);
    return { formattedText: formatSearchResults(results) };
  });
}

/** Promise boundary for legacy callers. */
export async function searchClawqlOperations(
  params: SearchInput,
  loadSpecFn: LoadSpecFn = loadSpec
): Promise<SearchOutput> {
  return Effect.runPromise(searchClawqlOperationsEffect(params, loadSpecFn));
}
