/**
 * Open Knowledge Format (OKF) v0.1 — ClawQL memory vault conventions.
 *
 * Spec: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
 * ADR: docs/adr/0009-enterprise-ontology.md
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

/** Fields written on every `memory_ingest` note (OKF + ClawQL extensions + legacy aliases). */
export type OkfMemoryFrontmatter = {
  /** OKF required. */
  type: string;
  title: string;
  description?: string;
  resource?: string | null;
  tags: string[];
  /** OKF recommended last-modified time (ISO 8601). */
  timestamp: string;
  /** ClawQL extension — correlates ingest to agent/session trail. */
  correlation_id?: string;
  /** ClawQL extension — WORM entry hash when available. */
  worm_ref?: string | null;
  /** ClawQL extension. */
  agent_id?: string;
  /** ClawQL extension — optional eval / quality verdict. */
  verdict?: string;
  /** Legacy Obsidian / digest compatibility. */
  date: string;
  clawql_ingest: true;
  clawql_ingest_created: string;
  clawql_okf: true;
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
  /** When set, used as `clawql_ingest_created` (defaults to timestamp). */
  createdAt?: string;
};
