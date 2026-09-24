/**
 * Fast Decision Primitive — core contracts (spec v0.4 §3).
 * Open registry of use sites; fixed candidate-set classifier with calibrated abstention.
 */

import type { Effect } from "effect";

/** One enumerable option scored in a single parallel pass. */
export type FastDecisionCandidate = {
  readonly candidateId: string;
  /** Use-site-specific features describing this candidate. */
  readonly features: Record<string, unknown>;
};

/** Decision-time context shared across use sites. */
export type FastDecisionContext = {
  readonly sessionId: string;
  readonly agentId?: string;
  readonly query?: string;
  readonly taskId?: string;
  /** Opaque bag for use-site providers (ontology snapshot, peers, history entries, …). */
  readonly extras?: Record<string, unknown>;
};

export type CostlyErrorDirection = "false_positive" | "false_negative";

export type FastDecisionOutcome = "above_threshold" | "below_threshold_fallback";

export type FastDecisionScore = {
  readonly candidateId: string;
  readonly confidence: number;
};

export type FastDecisionResult = {
  readonly useSiteId: string;
  readonly candidatesScored: number;
  readonly scores: readonly FastDecisionScore[];
  readonly thresholdApplied: number;
  readonly costlyErrorDirection: CostlyErrorDirection;
  readonly outcome: FastDecisionOutcome;
  /** Highest-scoring candidate when above threshold; undefined on fallback. */
  readonly selectedCandidateId?: string;
  readonly selectedConfidence?: number;
};

/**
 * Open-ended use-site registration. New applications register without changing
 * the primitive interface (replaces lettered Type A–H enums from v0.3).
 */
export type FastDecisionUseSite = {
  readonly useSiteId: string;
  readonly description: string;
  readonly candidateSetProvider: (
    ctx: FastDecisionContext
  ) => Effect.Effect<readonly FastDecisionCandidate[]>;
  readonly costlyErrorDirection: CostlyErrorDirection;
  /** Per §9 — set for THIS use site; never copied from another. */
  readonly threshold: number;
  readonly wormEntryType: string;
};

/** Built-in registry ids (§3.3). Illustrative, not closed. */
export type BuiltinFastDecisionUseSiteId =
  | "search_provider_tool_routing"
  | "skill_fast_path_match"
  | "ontology_vocabulary_term_match"
  | "document_entity_type_classification"
  | "field_to_schema_mapping"
  | "pattern_consistency_check"
  | "relationship_edge_classification"
  | "sgdop_peer_prefilter"
  | "pre_compaction_ontology_cache_check";

/**
 * WORM entry types for fast-decision decisions (§10).
 * Also mirrored on clawql-audit `WORMEntryType`.
 */
export type FastDecisionWORMEntryType =
  | "FAST_DECISION_ATTEMPTED"
  | "FAST_DECISION_ABOVE_THRESHOLD"
  | "FAST_DECISION_BELOW_THRESHOLD_FALLBACK"
  | "SKILL_FAST_PATH_EXECUTED"
  | "SKILL_FAST_PATH_REJECTED_STALE_SKILL"
  | "ONTOLOGY_STANDARD_TERM_USED"
  | "ONTOLOGY_NOVEL_FIELD_FALLBACK"
  | "SGDOP_PREFILTER_APPLIED"
  | "SGDOP_CANDIDATE_INCLUDED"
  | "PRE_COMPACTION_CACHE_CHECK_RUN"
  | "PRE_COMPACTION_CACHE_ITEM_WRITTEN";

export type SkillValidityStatus = "accepted" | "rejected" | "rolled_back";

export type SkillFastPathDecision =
  | {
      readonly path: "fast";
      readonly skillId: string;
      readonly confidence: number;
      readonly validityStatus: "accepted";
    }
  | {
      readonly path: "slow";
      readonly reason:
        | "below_threshold"
        | "stale_or_rolled_back"
        | "rejected"
        | "no_candidates"
        | "missing_validity";
      readonly skillId?: string;
      readonly confidence?: number;
      readonly validityStatus?: SkillValidityStatus;
    };

/** Coarse projection buckets for sgdop_peer_prefilter (§3.4) — not exact SGDOP math. */
export type SgdopProjectionBucket = "high" | "medium" | "low";

export type PreferredVocabulary =
  "schema.org" | "fibo" | "dublin-core" | "project-local" | (string & {});
