import type { WORMAppendInput, WORMEntryType } from "clawql-audit";

export type PiHookKind =
  | "api_call"
  | "api_result"
  | "memory_recall"
  | "memory_ingest"
  | "session_start"
  | "session_end"
  | "panguard_deny";

export type PiHookEvent = {
  readonly kind: PiHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly operation?: string;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<PiHookKind, WORMEntryType> = {
  api_call: "TOOL_CALL_ATTEMPT",
  api_result: "TOOL_CALL_RESULT",
  memory_recall: "TOOL_CALL_ATTEMPT",
  memory_ingest: "TOOL_CALL_ATTEMPT",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
  panguard_deny: "PANGUARD_DENY",
};

export const piHookToWormAppend = (event: PiHookEvent, agentName = "pi"): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    operation: event.operation,
    success: event.success,
    ...event.metadata,
  },
});
