/**
 * OpenBenchTrace v1.1 — publish-ready session/trial record.
 * Outer envelope wraps RTP (`rtp`). Keep in sync with openbench-trace.v1.json
 * and packages/openbench-dataset/src/schema/types.ts.
 */
export type OpenBenchArm = "on" | "off";
export type OpenBenchVerdict = "pass" | "fail" | "partial";

export type OpenAIMessage = {
  role: string;
  content: string | null | unknown;
  [key: string]: unknown;
};

export type OpenBenchToolCall = {
  tool: string;
  input?: unknown;
  output?: unknown;
  [key: string]: unknown;
};

/** Minimal RTP types mirrored for openbench/ consumers (full types in openbench-dataset). */
export type RtpSession = {
  protocol: "rtp";
  protocolVersion: string;
  consentToken: {
    token: string;
    scopes: string[];
    issuedAt: string;
    issuer: string;
    subject: string;
  };
  turnSequence: Array<Record<string, unknown>>;
  verdict: {
    outcome: OpenBenchVerdict;
    evaluatorTier: 1 | 2 | 3;
    source: "grader";
    graderId: string;
    score: number;
  };
};

export type OpenBenchTraceV1 = {
  schema_version: "1.0" | "1.1";
  trace_id: string;
  run_id: string;
  task_id: string;
  arm: OpenBenchArm;
  /** Full arm id from the harness (clawql-on, ouroboros-off, …). */
  arm_label: string;
  phase: number;
  model: string;
  harness: string;
  clawql_version: string;
  messages: OpenAIMessage[];
  tool_calls: OpenBenchToolCall[];
  verdict: OpenBenchVerdict;
  verdict_source: "grader";
  score: number;
  grader_id: string;
  turns: number | null;
  elapsed_ms: number | null;
  total_tokens: number | null;
  hit_turn_cap: boolean;
  hit_time_cap: boolean;
  hit_token_cap: boolean;
  presidio_version: string;
  redaction_policy_hash: string;
  pii_fields_redacted: string[];
  content_hash: string;
  redacted_hash: string;
  manifest_id: string;
  collected_at: string;
  suitable_for_training: boolean;
  /** Optional links into companion call-store JSONL. */
  inference_call_ids?: string[];
  /** Required for schema_version 1.1+. */
  rtp?: RtpSession;
};

export const OPENBENCH_TRACE_SCHEMA_VERSION = "1.1" as const;
export const OPENBENCH_TRACE_SCHEMA_PATH = "openbench/schema/openbench-trace.v1.json";
