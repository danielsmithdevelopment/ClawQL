/**
 * WORM entry schema. Unknown additional fields on write input are accepted via metadata
 * or by extending the body before seal — callers may add framework-specific context.
 */

export const WORM_GENESIS_PREV_HASH = "0".repeat(64);

export type WORMEntryType =
  | "SESSION_START"
  | "SESSION_END"
  | "INFERENCE_CALL"
  | "INFERENCE_RESULT"
  | "TOOL_CALL_ATTEMPT"
  | "TOOL_CALL_RESULT"
  | "PANGUARD_DENY"
  | "PANGUARD_ALLOW"
  | "BUDGET_EXHAUSTED"
  | "BUDGET_WARNING"
  | "AGENT_ACTION"
  | "AGENT_OBSERVATION"
  | "AGENT_DELEGATION"
  | "AGENT_DELEGATION_RESULT"
  | "HERMES_SKILL_QUERY"
  | "HERMES_SKILL_UPDATE"
  | "CRON_TRIGGER"
  | "CLINE_FILE_WRITE_ATTEMPT"
  | "CLINE_FILE_WRITE_RESULT"
  | "CLINE_TERMINAL_EXEC_ATTEMPT"
  | "CLINE_TERMINAL_EXEC_RESULT"
  | "CLINE_SESSION_START"
  | "CLINE_SESSION_END"
  | "OPENHANDS_ACTION"
  | "OPENHANDS_OBSERVATION"
  | "REASONING_CAPTURED_PLAINTEXT"
  | "REASONING_CAPTURED_ENCRYPTED"
  | "HUMAN_APPROVAL"
  | "HUMAN_REJECTION"
  | "HUMAN_DECISION_REQUESTED"
  | "BENCHMARK_TASK"
  | "SUSPICIOUS_MEMORY_CONTENT"
  | (string & {});

export type WORMEntry = {
  id: string;
  hash: string;
  prevHash: string;
  chainIndex: number;
  writtenAt: string;
  backendAcks: string[];
  type: WORMEntryType;
  timestamp: string;
  sessionId: string;
  agentName?: string;
  virtualKeyId?: string;
  cellId?: string;
  teeSignature?: string;
  metadata?: Record<string, unknown>;
};

/** Caller-supplied fields for append (system fields filled by clawql-audit). */
export type WORMAppendInput = Omit<
  WORMEntry,
  "id" | "hash" | "prevHash" | "chainIndex" | "writtenAt" | "backendAcks"
>;

export type WORMFilter = {
  sessionId?: string;
  type?: string;
  agentName?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
};

export type ChainVerifyResult = {
  valid: boolean;
  invalidAt?: number;
  reason?: string;
};
