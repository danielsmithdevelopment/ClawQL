/**
 * Routing-trust catalog drift vs the frozen v0.4/v0.6 source catalogs.
 *
 * `search_provider_tool_routing` earned productionTrusted against
 * `routing-fresh-v0.4-source-catalog.json`. Since then 8.0 purges, twin
 * merges, toolkits, `sources_propose`/`resume`, and opt-in demotions reshaped
 * the live default MCP surface. Schema v4 does not republish those JSON
 * Schemas (MCP still uses Zod at the wire), but the *names* in the live
 * catalog no longer match the freeze.
 *
 * Honesty: `calibrated: true` stays off until a new freeze (or a v0.6-style
 * suite whose catalog includes the live default-on tools) passes.
 *
 * @see FREEZE-v0.4-routing-fresh.md
 * @see FREEZE-v0.6-routing-fresh.md
 */

/** SHA-256 from FREEZE-v0.4-routing-fresh.md (canonical JSON of the source catalog). */
export const FROZEN_V04_SOURCE_CATALOG_DIGEST =
  "57352fb8b30ffae82343a883bf0bf4e9d2dd0ebfcdff5117ad58db937613db52";

/** SHA-256 from FREEZE-v0.6-routing-fresh.md. Same 38 entry bodies as v0.5; new catalogId. */
export const FROZEN_V06_SOURCE_CATALOG_DIGEST =
  "12838c00d757ea9570bb3afdabac29645f11b951552dda9d6c055136dfd4a660";

/** Fixture-only distractors in the freeze (never registered as MCP tools). */
const FROZEN_ROUTING_FIXTURE_SUFFIXES = [
  "_title_flag_a",
  "_title_flag_b",
  "_overbroad",
  "_cohort_count",
] as const;

function isFrozenFixtureOnlyMcpName(name: string): boolean {
  return FROZEN_ROUTING_FIXTURE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Product-shaped MCP tool ids (no `mcp.` prefix) in the frozen routing catalogs.
 * Skills / anti-patterns / title-flag distractors are scoring fixtures, not
 * live MCP registrations.
 */
export const FROZEN_ROUTING_MCP_TOOL_NAMES = [
  "search",
  "execute",
  "memory_recall",
  "memory_ingest",
  "data_query",
  "cache",
  "audit",
  "skills_list",
  "skills_get",
  "sandbox_exec",
  "notify",
  "schedule",
  "ingest_external_knowledge",
  "knowledge_search_onyx",
  "clawql_think",
  "pageindex_build_tree",
  "ouroboros_run_evolutionary_loop",
] as const;

export { isFrozenFixtureOnlyMcpName };

/**
 * Default-on Core MCP tools after 8.0 (no instance spec, no CLAWQL_ENABLE_*).
 * Memory + documents flags are on, but document *tools* still need extra
 * opt-in (`CLAWQL_EXTERNAL_INGEST`, Onyx, IDP, …). ChatGPT extension tools
 * are default-on at the flag layer but host-capability gated — listed
 * separately so routing drift is not confused with Apps-only surfaces.
 */
export const LIVE_DEFAULT_CORE_MCP_TOOL_NAMES = [
  "search",
  "execute",
  "resume",
  "cache",
  "audit",
  "skills_list",
  "skills_get",
  "sources_propose",
  "sources_approve",
  "memory_ingest",
  "memory_recall",
  "read_around",
  "memory_sync",
] as const;

/** ChatGPT MCP Apps tools — default flag on, omitted unless the host attaches. */
export const LIVE_DEFAULT_CHATGPT_MCP_TOOL_NAMES = [
  "clawql_settings_read",
  "clawql_settings_update",
  "clawql_mentions_search",
  "clawql_evidence",
  "clawql_console",
  "clawql_open_file",
] as const;

export type RoutingCatalogDrift = {
  readonly frozenMcpTools: readonly string[];
  readonly liveDefaultCoreTools: readonly string[];
  /** In the freeze, absent from live default-on Core (purged or now opt-in). */
  readonly missingFromLiveDefault: readonly string[];
  /** Live default-on Core tools the freeze never saw. */
  readonly extraInLiveDefault: readonly string[];
  readonly aligned: boolean;
};

function sortedUnique(names: readonly string[]): string[] {
  return [...new Set(names)].sort();
}

export function diffRoutingCatalog(opts?: {
  readonly frozen?: readonly string[];
  readonly live?: readonly string[];
}): RoutingCatalogDrift {
  const frozenMcpTools = sortedUnique(opts?.frozen ?? FROZEN_ROUTING_MCP_TOOL_NAMES);
  const liveDefaultCoreTools = sortedUnique(opts?.live ?? LIVE_DEFAULT_CORE_MCP_TOOL_NAMES);
  const frozenSet = new Set(frozenMcpTools);
  const liveSet = new Set(liveDefaultCoreTools);
  const missingFromLiveDefault = frozenMcpTools.filter((n) => !liveSet.has(n));
  const extraInLiveDefault = liveDefaultCoreTools.filter((n) => !frozenSet.has(n));
  return {
    frozenMcpTools,
    liveDefaultCoreTools,
    missingFromLiveDefault,
    extraInLiveDefault,
    aligned: missingFromLiveDefault.length === 0 && extraInLiveDefault.length === 0,
  };
}

/**
 * Production-trust gate for `calibrated: true` on `search_provider_tool_routing`.
 * False until live default-on Core tools match a frozen routing catalog.
 */
export function routingCatalogAlignedForProductionTrust(): boolean {
  return diffRoutingCatalog().aligned;
}
