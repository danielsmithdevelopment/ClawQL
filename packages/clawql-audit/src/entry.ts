export type BackendAck = "local" | "remote" | "remote_queued";

export type WORMFilter = {
  sessionId?: string;
  type?: WORMEntryType;
  since?: string;
  until?: string;
};

export interface WORMEntry {
  id: string;
  hash: string;
  prev_hash: string;
  seq: number;
  writtenAt: string;
  backendAcks: BackendAck[];
  type: WORMEntryType;
  timestamp: string;
  sessionId: string;
  agentName?: string;
  virtualKeyId?: string;
  cellId?: string;
  teeSignature?: string;
  metadata?: Record<string, unknown>;
}

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
  | "VENDOR_EXTENSION"
  | "MCP_TOKEN_ISSUED"
  | "MCP_TOKEN_REVOKED"
  | "MCP_TOKEN_REFRESHED"
  | "ID_JAG_ASSERTION_ISSUED"
  | "API_KEY_ISSUED"
  | "API_KEY_REVOKED";

export type WORMAppendInput = Omit<
  WORMEntry,
  "id" | "hash" | "prev_hash" | "seq" | "writtenAt" | "backendAcks"
>;
