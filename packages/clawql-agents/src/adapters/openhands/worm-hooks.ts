import type { WORMAppendInput, WORMEntryType } from "clawql-audit";

export type OpenHandsHookKind =
  | "action"
  | "observation"
  | "inference"
  | "session_start"
  | "session_end"
  | "budget_exhausted"
  | "panguard_deny";

export type OpenHandsHookEvent = {
  readonly kind: OpenHandsHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly actionType?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<OpenHandsHookKind, WORMEntryType> = {
  action: "OPENHANDS_ACTION",
  observation: "OPENHANDS_OBSERVATION",
  inference: "INFERENCE_CALL",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
  budget_exhausted: "BUDGET_EXHAUSTED",
  panguard_deny: "PANGUARD_DENY",
};

export const openHandsHookToWormAppend = (
  event: OpenHandsHookEvent,
  agentName = "openhands"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    actionType: event.actionType,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    costUsd: event.costUsd,
    ...event.metadata,
  },
});
