/**
 * Open Knowledge Format (OKF) v0.2 — ClawQL memory vault conventions.
 *
 * Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 * Also: https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md
 * ADR: docs/adr/0009-enterprise-ontology.md
 * Guide: docs/memory/okf.md
 */

/** ClawQL extension of OKF `type` (producers define taxonomy; not centrally registered). */
export const OKF_MEMORY_TYPES = [
  "decision",
  "context",
  "error",
  "runbook",
  "entity",
  "relationship",
  "task_result",
  "ontology_entity",
  "ontology_relationship",
  "ontology_action",
  /** Generated catalog pages (`index.md`, `_INDEX_*`). */
  "index",
  /** Append-only vault changelog (`log.md`). */
  "log",
  /** Rolling vault digest notes. */
  "digest",
] as const;

export type OkfMemoryType = (typeof OKF_MEMORY_TYPES)[number];

export const DEFAULT_OKF_MEMORY_TYPE: OkfMemoryType = "context";

export const OKF_INGEST_TAG = "clawql-ingest";

/** OKF v0.2 lifecycle status. */
export const OKF_STATUS_VALUES = ["current", "stale", "superseded", "retracted"] as const;
export type OkfStatus = (typeof OKF_STATUS_VALUES)[number];

/** OKF v0.2 `verified.by` values. */
export const OKF_VERIFIED_BY_VALUES = ["human", "evaluator", "agent"] as const;
export type OkfVerifiedBy = (typeof OKF_VERIFIED_BY_VALUES)[number];

/** OKF v0.2 `verified.method` values. */
export const OKF_VERIFIED_METHOD_VALUES = ["pr-review", "evaluator", "auto"] as const;
export type OkfVerifiedMethod = (typeof OKF_VERIFIED_METHOD_VALUES)[number];

/** OKF format version marker written on every ClawQL note. */
export const OKF_FORMAT_VERSION = "0.2";

/** Who/what generated the entry (OKF v0.2). */
export type OkfGenerated = {
  by?: string;
  at?: string;
  tool?: string;
  model?: string;
  session?: string;
};

/** Verification trust signal (OKF v0.2). */
export type OkfVerified = {
  by?: OkfVerifiedBy | string;
  at?: string;
  method?: OkfVerifiedMethod | string;
  reviewer?: string;
};

/** Provenance source row (OKF v0.2). */
export type OkfSource =
  | { url: string; fetched_at?: string }
  | { session_id: string; turn?: number | string }
  | Record<string, string | number>;

/** Fields written on every `memory_ingest` note (OKF v0.2 + ClawQL extensions + legacy aliases). */
export type OkfMemoryFrontmatter = {
  /** OKF required. */
  type: string;
  title: string;
  description?: string;
  resource?: string | null;
  tags: string[];
  /** OKF recommended last-modified time (ISO 8601). */
  timestamp: string;

  // --- OKF v0.2 trust signals ---
  generated?: OkfGenerated;
  verified?: OkfVerified;
  sources?: OkfSource[];
  stale_after?: string;
  status?: OkfStatus;
  superseded_by?: string | null;

  /** ClawQL extension — correlates ingest to agent/session trail. */
  correlation_id?: string;
  /** ClawQL extension — WORM entry hash when available. */
  worm_ref?: string | null;
  /** ClawQL extension. */
  agent_id?: string;
  /** ClawQL extension — optional eval / quality verdict. */
  verdict?: string;
  /** ClawQL extension — optional confidence 0–1. */
  confidence_score?: number;

  /** Legacy Obsidian / digest compatibility. */
  date: string;
  clawql_ingest: true;
  clawql_ingest_created: string;
  clawql_okf: true;
  /** ClawQL marker for OKF format version (`0.2`). */
  okf_version?: string;
};

export type BuildOkfFrontmatterInput = {
  title: string;
  type?: string;
  description?: string;
  resource?: string | null;
  tags?: string[];
  timestamp?: string;
  correlationId?: string;
  wormRef?: string | null;
  agentId?: string;
  verdict?: string;
  confidenceScore?: number;
  /** When set, used as `clawql_ingest_created` (defaults to timestamp). */
  createdAt?: string;
  /** OKF v0.2 — generation provenance (defaults from agentId / tool / session). */
  generated?: OkfGenerated;
  verified?: OkfVerified;
  sources?: OkfSource[];
  staleAfter?: string;
  status?: OkfStatus;
  supersededBy?: string | null;
  /** Model id for `generated.model` when not in `generated`. */
  model?: string;
  sessionId?: string;
};
