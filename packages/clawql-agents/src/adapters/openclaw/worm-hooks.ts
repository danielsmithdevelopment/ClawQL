import type { WORMAppendInput, WORMEntryType } from "clawql-audit";

/** OpenClaw Gateway / skill events mapped to WORM entry types. */
export type OpenClawHookKind =
  | "skill_invoke"
  | "skill_result"
  | "command"
  | "cron_trigger"
  | "session_start"
  | "session_end"
  | "panguard_deny";

export type OpenClawHookEvent = {
  readonly kind: OpenClawHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly skillName?: string;
  readonly command?: string;
  readonly cronJob?: string;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<OpenClawHookKind, WORMEntryType> = {
  skill_invoke: "TOOL_CALL_ATTEMPT",
  skill_result: "TOOL_CALL_RESULT",
  command: "AGENT_ACTION",
  cron_trigger: "CRON_TRIGGER",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
  panguard_deny: "PANGUARD_DENY",
};

export const openClawHookToWormAppend = (
  event: OpenClawHookEvent,
  agentName = "openclaw"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    skillName: event.skillName,
    command: event.command,
    cronJob: event.cronJob,
    success: event.success,
    ...event.metadata,
  },
});
