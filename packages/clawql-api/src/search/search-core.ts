/**
 * Core `search` — keyword search over loaded operations **and** skill index (8.0).
 */

import { Effect } from "effect";
import type { Context } from "effect";
import {
  atrScopeFromTokens,
  filterSkillsByAtr,
  SkillRegistry,
  type SkillIndexEntry,
} from "clawql-core";
import { loadSpec } from "../spec/spec-loader.js";
import {
  formatSearchResults,
  mergeRankedHits,
  searchOperations,
  searchSkills,
  type OperationSearchResult,
} from "../spec/spec-search.js";
import type { SearchInput, SearchOutput } from "../search-service.js";
import { listProcessSkillIndexEffect } from "../skills/process-skills.js";
import { resolveSearchAtrTokens } from "./process-search-atr.js";

export type LoadSpecFn = typeof loadSpec;

export type SearchCoreOptions = {
  /** Prefer host SkillRegistry; falls back to process-bound registry. */
  readonly skillRegistry?: Context.Tag.Service<typeof SkillRegistry>;
  /**
   * Session ATR tokens for filtering provider-bundled skills (§6.4).
   * - omit / undefined → resolve process bind / `CLAWQL_SESSION_ATR`
   * - `null` → explicitly disable ATR filtering
   * - array (incl. empty) → filter provider skills against that scope
   */
  readonly atrScopeTokens?: readonly string[] | null;
};

function fromPromise<A>(fn: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: fn,
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function listSkillsEffect(
  options?: SearchCoreOptions
): Effect.Effect<readonly SkillIndexEntry[], never> {
  if (options?.skillRegistry) {
    return options.skillRegistry.listIndex();
  }
  return listProcessSkillIndexEffect();
}

/** Shared search body — operations + skills, one ranked list. */
export function searchClawqlOperationsEffect(
  params: SearchInput,
  loadSpecFn: LoadSpecFn = loadSpec,
  options?: SearchCoreOptions
): Effect.Effect<SearchOutput, Error> {
  const limit = params.limit ?? 5;
  return Effect.gen(function* () {
    const { operations } = yield* fromPromise(() => loadSpecFn());
    const opHits: OperationSearchResult[] = searchOperations(operations, params.query, limit);
    const skillIndex = yield* listSkillsEffect(options);
    const atrTokens = resolveSearchAtrTokens(options?.atrScopeTokens);
    const atrScope = atrTokens === undefined ? undefined : atrScopeFromTokens(atrTokens);
    const visibleSkills = filterSkillsByAtr(skillIndex, atrScope);
    const skillHits = searchSkills(visibleSkills, params.query, limit);
    const merged = mergeRankedHits(opHits, skillHits, limit);
    return { formattedText: formatSearchResults(merged) };
  }).pipe(Effect.withSpan("clawql.search", { attributes: { "clawql.query": params.query } }));
}

/** Promise boundary for legacy callers. */
export async function searchClawqlOperations(
  params: SearchInput,
  loadSpecFn: LoadSpecFn = loadSpec,
  options?: SearchCoreOptions
): Promise<SearchOutput> {
  return Effect.runPromise(searchClawqlOperationsEffect(params, loadSpecFn, options));
}
