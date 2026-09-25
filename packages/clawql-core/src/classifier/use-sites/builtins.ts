/**
 * Built-in Fast Decision use sites (§3.3). Open registry — callers may add more.
 */

import { Effect } from "effect";
import type { FastDecisionCandidate, FastDecisionContext, FastDecisionUseSite } from "../types.js";

function fromExtrasArray(ctx: FastDecisionContext, key: string): readonly FastDecisionCandidate[] {
  const raw = ctx.extras?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (item && typeof item === "object" && "candidateId" in item) {
      const c = item as FastDecisionCandidate;
      return {
        candidateId: String(c.candidateId),
        features: c.features ?? {},
      };
    }
    return {
      candidateId: String((item as { id?: string })?.id ?? `candidate-${i}`),
      features: (item as Record<string, unknown>) ?? {},
    };
  });
}

/** search_provider_tool_routing — accelerates search ranking; does not replace it. */
export const searchProviderToolRoutingUseSite: FastDecisionUseSite = {
  useSiteId: "search_provider_tool_routing",
  description: "Which provider/tool is relevant to a query (accelerates search ranking)",
  costlyErrorDirection: "false_positive",
  /** Locked τ=0.70 from fit-routing-v0.1 (FP-costly rule). See FIT_TAU_FREEZE_v0.1.md. */
  threshold: 0.7,
  wormEntryType: "FAST_DECISION_ATTEMPTED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "providerToolCandidates")),
};

/** skill_fast_path_match — committed valid skill coverage check. */
export const skillFastPathMatchUseSite: FastDecisionUseSite = {
  useSiteId: "skill_fast_path_match",
  description: "Does a currently-valid committed skill already cover this task",
  costlyErrorDirection: "false_positive",
  threshold: 0.85,
  wormEntryType: "SKILL_FAST_PATH_EXECUTED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "skillCandidates")),
};

/** ontology_vocabulary_term_match — Layer 3 preferredVocabulary preference. */
export const ontologyVocabularyTermMatchUseSite: FastDecisionUseSite = {
  useSiteId: "ontology_vocabulary_term_match",
  description:
    "Does a standard vocabulary term exist for a promotion candidate? Prefer authoritative ontology vocabulary (FIBO, schema.org) over novel project-local field names.",
  costlyErrorDirection: "false_positive",
  threshold: 0.7,
  wormEntryType: "ONTOLOGY_STANDARD_TERM_USED",
  candidateSetProvider: (ctx) =>
    Effect.sync(() => fromExtrasArray(ctx, "vocabularyTermCandidates")),
};

export const documentEntityTypeClassificationUseSite: FastDecisionUseSite = {
  useSiteId: "document_entity_type_classification",
  description: "What kind of document/entity is this, at ingest",
  costlyErrorDirection: "false_positive",
  threshold: 0.7,
  wormEntryType: "FAST_DECISION_ATTEMPTED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "documentTypeCandidates")),
};

export const fieldToSchemaMappingUseSite: FastDecisionUseSite = {
  useSiteId: "field_to_schema_mapping",
  description: "Which existing Layer 1 field does this extracted value belong to",
  costlyErrorDirection: "false_positive",
  threshold: 0.75,
  wormEntryType: "FAST_DECISION_ATTEMPTED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "schemaFieldCandidates")),
};

export const patternConsistencyCheckUseSite: FastDecisionUseSite = {
  useSiteId: "pattern_consistency_check",
  description: "Does this occurrence match the expected shape for its pattern",
  costlyErrorDirection: "false_positive",
  threshold: 0.7,
  wormEntryType: "FAST_DECISION_ATTEMPTED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "patternCandidates")),
};

export const relationshipEdgeClassificationUseSite: FastDecisionUseSite = {
  useSiteId: "relationship_edge_classification",
  description: "What kind of relationship connects two established entities",
  costlyErrorDirection: "false_positive",
  threshold: 0.75,
  wormEntryType: "FAST_DECISION_ATTEMPTED",
  candidateSetProvider: (ctx) =>
    Effect.sync(() => fromExtrasArray(ctx, "relationshipTypeCandidates")),
};

/**
 * sgdop_peer_prefilter — bloom-filter style inclusion (§8).
 * Coarse approximation only; never replaces exact SGDOP projection (§3.4, §12).
 */
export const sgdopPeerPrefilterUseSite: FastDecisionUseSite = {
  useSiteId: "sgdop_peer_prefilter",
  description: "Which available peers are plausibly worth the exact SGDOP projection",
  costlyErrorDirection: "false_negative",
  threshold: 0.35,
  wormEntryType: "SGDOP_PREFILTER_APPLIED",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "peerCandidates")),
};

/**
 * pre_compaction_ontology_cache_check — continuous quality-motivated curation (§6).
 * Framed as cache_this / dont_cache_this per entry with ontology/cache/audit features.
 */
export const preCompactionOntologyCacheCheckUseSite: FastDecisionUseSite = {
  useSiteId: "pre_compaction_ontology_cache_check",
  description:
    "What in the current uncompacted context is load-bearing and must be cached before pruning",
  costlyErrorDirection: "false_negative",
  threshold: 0.35,
  wormEntryType: "PRE_COMPACTION_CACHE_CHECK_RUN",
  candidateSetProvider: (ctx) => Effect.sync(() => fromExtrasArray(ctx, "historyEntryCandidates")),
};

export const BUILTIN_FAST_DECISION_USE_SITES: readonly FastDecisionUseSite[] = [
  searchProviderToolRoutingUseSite,
  skillFastPathMatchUseSite,
  ontologyVocabularyTermMatchUseSite,
  documentEntityTypeClassificationUseSite,
  fieldToSchemaMappingUseSite,
  patternConsistencyCheckUseSite,
  relationshipEdgeClassificationUseSite,
  sgdopPeerPrefilterUseSite,
  preCompactionOntologyCacheCheckUseSite,
];
