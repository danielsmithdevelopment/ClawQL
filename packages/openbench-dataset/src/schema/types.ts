/**
 * OpenBenchTrace v1.0 — publish-ready session/trial record.
 * JSON Schema: ../schema/openbench-trace.v1.json
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

export type OpenBenchTraceV1 = {
  schema_version: "1.0";
  trace_id: string;
  run_id: string;
  task_id: string;
  arm: OpenBenchArm;
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
  inference_call_ids?: string[];
};

export const OPENBENCH_TRACE_SCHEMA_VERSION = "1.0" as const;
