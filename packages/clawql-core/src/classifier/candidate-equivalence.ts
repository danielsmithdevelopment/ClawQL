/**
 * Declared mcp.* ↔ skill.* twin equivalence for Fast Decision routing.
 *
 * Twins are the same capability under two catalog IDs (raw MCP tool vs skill
 * wrapper). They count as one correct answer for held-out / reject-arm
 * correctness. They are ontology bugs when scored as errors — not model misses.
 *
 * NOT twins (do not add here): multi-tool skills (composed-mcp), broad vault
 * wrappers, anti-patterns (memory_recall_overbroad), or cross-capability
 * distractors that merely co-occur in a candidate set.
 *
 * @see held-out/fixtures/CATALOG_TWIN_EQUIVALENCE.md
 * @see held-out/fixtures/V06_SHIP_RULE_SPEND.md
 */

import { Context, Effect, Layer } from "effect";

/** Canonical twin pairs — each unordered pair is one equivalence class. */
export const ROUTING_TOOL_SKILL_TWIN_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["mcp.search", "skill.clawql-search-workflows"],
  ["mcp.execute", "skill.clawql-execute-workflows"],
  ["mcp.memory_ingest", "skill.clawql-memory-ingest"],
  ["mcp.memory_recall", "skill.clawql-memory-recall"],
  ["mcp.notify", "skill.clawql-notify-workflows"],
  ["mcp.schedule", "skill.clawql-schedule-workflows"],
  ["mcp.sandbox_exec", "skill.clawql-sandbox-exec"],
  ["mcp.audit", "skill.clawql-audit-workflows"],
  ["mcp.cache", "skill.clawql-cache-workflows"],
  ["mcp.ingest_external_knowledge", "skill.clawql-external-ingest"],
  ["mcp.knowledge_search_onyx", "skill.clawql-onyx-knowledge-workflows"],
  ["mcp.ouroboros_run_evolutionary_loop", "skill.clawql-ouroboros-workflows"],
  ["mcp.clawql_think", "skill.deep-thinking"],
];

function buildTwinIndex(
  pairs: ReadonlyArray<readonly [string, string]>
): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const [a, b] of pairs) {
    const set = new Set<string>([a, b]);
    map.set(a, set);
    map.set(b, set);
  }
  return map;
}

const DEFAULT_TWIN_INDEX = buildTwinIndex(ROUTING_TOOL_SKILL_TWIN_PAIRS);

/**
 * True when `predicted` and `groundTruth` are the same id or a declared twin.
 * Exact match always wins; twin membership is symmetric.
 */
export function candidatesEquivalent(
  predicted: string,
  groundTruth: string,
  twinIndex: ReadonlyMap<string, ReadonlySet<string>> = DEFAULT_TWIN_INDEX
): boolean {
  if (predicted === groundTruth) return true;
  const classForGt = twinIndex.get(groundTruth);
  return Boolean(classForGt?.has(predicted));
}

/** Members of the equivalence class containing `id` (at least `{id}`). */
export function equivalenceClassOf(
  id: string,
  twinIndex: ReadonlyMap<string, ReadonlySet<string>> = DEFAULT_TWIN_INDEX
): ReadonlySet<string> {
  return twinIndex.get(id) ?? new Set([id]);
}

export type CandidateEquivalenceApi = {
  readonly candidatesEquivalent: (predicted: string, groundTruth: string) => Effect.Effect<boolean>;
  readonly equivalenceClassOf: (id: string) => Effect.Effect<ReadonlySet<string>>;
};

export class CandidateEquivalence extends Context.Tag("clawql/CandidateEquivalence")<
  CandidateEquivalence,
  CandidateEquivalenceApi
>() {}

export function createCandidateEquivalenceLayer(
  pairs: ReadonlyArray<readonly [string, string]> = ROUTING_TOOL_SKILL_TWIN_PAIRS
): Layer.Layer<CandidateEquivalence> {
  const index = buildTwinIndex(pairs);
  return Layer.succeed(CandidateEquivalence, {
    candidatesEquivalent: (predicted, groundTruth) =>
      Effect.sync(() => candidatesEquivalent(predicted, groundTruth, index)),
    equivalenceClassOf: (id) => Effect.sync(() => equivalenceClassOf(id, index)),
  });
}

export const CandidateEquivalenceLive: Layer.Layer<CandidateEquivalence> =
  createCandidateEquivalenceLayer();
