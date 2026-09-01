import type { WORMAppendInput, WORMEntryType } from "clawql-audit";

/** Hermes AIAgent / skill-library / delegation events. */
export type HermesHookKind =
  | "skill_query"
  | "skill_write"
  | "delegation"
  | "delegation_result"
  | "cron_trigger"
  | "session_start"
  | "session_end";

export type HermesHookEvent = {
  readonly kind: HermesHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly delegationId?: string;
  readonly skillName?: string;
  readonly query?: string;
  readonly subagent?: string;
  readonly cronJob?: string;
  readonly success?: boolean;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<HermesHookKind, WORMEntryType> = {
  skill_query: "HERMES_SKILL_QUERY",
  skill_write: "HERMES_SKILL_UPDATE",
  delegation: "AGENT_DELEGATION",
  delegation_result: "AGENT_DELEGATION_RESULT",
  cron_trigger: "CRON_TRIGGER",
  session_start: "SESSION_START",
  session_end: "SESSION_END",
};

export const hermesHookToWormAppend = (
  event: HermesHookEvent,
  agentName = "hermes"
): WORMAppendInput => ({
  type: TYPE_MAP[event.kind],
  timestamp: event.timestamp ?? new Date().toISOString(),
  sessionId: event.sessionId,
  agentName,
  metadata: {
    delegationId: event.delegationId,
    skillName: event.skillName,
    query: event.query,
    subagent: event.subagent,
    cronJob: event.cronJob,
    success: event.success,
    ...event.metadata,
  },
});
