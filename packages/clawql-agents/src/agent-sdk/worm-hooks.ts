/**
 * Map Cursor Agent SDK session events → clawql-audit WORMAppendInput.
 *
 * Used by docs/examples/agent-sdk/hooks and by runners that observe Agent SDK
 * sessions in-process. Does not depend on `@grok/agent-sdk` at compile time —
 * event shapes are structural.
 */
import type { WORMAppendInput, WORMEntryType } from "clawql-audit";
import { Effect } from "effect";

/** Structural subset of Agent SDK session event payloads we care about. */
export type AgentSdkHookKind =
  | "session.started"
  | "session.completed"
  | "session.failed"
  | "actions.requested"
  | "action.result"
  | "action.approval_requested"
  | "action.approval_resolved"
  | "turn.failed";

export type AgentSdkActionCall = {
  readonly callId: string;
  readonly toolName: string;
  readonly connection?: string;
  readonly args?: unknown;
};

export type AgentSdkHookEvent = {
  readonly kind: AgentSdkHookKind;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly channelId?: string;
  readonly dryRun?: boolean;
  readonly message?: string;
  readonly status?: string;
  readonly calls?: readonly AgentSdkActionCall[];
  readonly callId?: string;
  readonly toolName?: string;
  readonly connection?: string;
  readonly isError?: boolean;
  readonly stubbed?: boolean;
  readonly decision?: "approve" | "deny" | string;
  readonly by?: string;
  readonly metadata?: Record<string, unknown>;
};

const TYPE_MAP: Record<AgentSdkHookKind, WORMEntryType> = {
  "session.started": "SESSION_START",
  "session.completed": "SESSION_END",
  "session.failed": "SESSION_END",
  "actions.requested": "TOOL_CALL_ATTEMPT",
  "action.result": "TOOL_CALL_RESULT",
  "action.approval_requested": "HUMAN_DECISION_REQUESTED",
  "action.approval_resolved": "HUMAN_APPROVAL",
  "turn.failed": "AGENT_OBSERVATION",
};

export const agentSdkEventToWormAppendEffect = (
  event: AgentSdkHookEvent,
  agentName = "agent-sdk"
): Effect.Effect<WORMAppendInput> =>
  Effect.sync(() => {
    let type = TYPE_MAP[event.kind];
    if (event.kind === "action.approval_resolved" && event.decision === "deny") {
      type = "HUMAN_REJECTION";
    }
    return {
      type,
      timestamp: event.timestamp ?? new Date().toISOString(),
      sessionId: event.sessionId,
      agentName,
      metadata: {
        agentSdkKind: event.kind,
        channelId: event.channelId,
        dryRun: event.dryRun,
        message: event.message,
        status: event.status,
        callId: event.callId,
        toolName: event.toolName,
        connection: event.connection,
        isError: event.isError,
        stubbed: event.stubbed,
        decision: event.decision,
        by: event.by,
        calls: event.calls,
        ...event.metadata,
      },
    } satisfies WORMAppendInput;
  });

/** Sync façade for hooks that cannot yield* Effect (forced host boundary). */
export const agentSdkEventToWormAppend = (
  event: AgentSdkHookEvent,
  agentName = "agent-sdk"
): WORMAppendInput => Effect.runSync(agentSdkEventToWormAppendEffect(event, agentName));

/**
 * Expand `actions.requested` into one WORM row per tool call (preferred for
 * audit granularity). Other kinds yield a single row.
 */
export const agentSdkEventToWormAppendsEffect = (
  event: AgentSdkHookEvent,
  agentName = "agent-sdk"
): Effect.Effect<readonly WORMAppendInput[]> =>
  Effect.gen(function* () {
    if (event.kind === "actions.requested" && event.calls && event.calls.length > 0) {
      const rows: WORMAppendInput[] = [];
      for (const call of event.calls) {
        rows.push(
          yield* agentSdkEventToWormAppendEffect(
            {
              kind: "actions.requested",
              sessionId: event.sessionId,
              timestamp: event.timestamp,
              callId: call.callId,
              toolName: call.toolName,
              connection: call.connection,
              metadata: { args: call.args },
            },
            agentName
          )
        );
      }
      return rows;
    }
    return [yield* agentSdkEventToWormAppendEffect(event, agentName)];
  });

export type AgentSdkAuditHttpConfig = {
  readonly baseUrl: string;
  readonly apiKey: string;
  /** When true, missing config or HTTP errors fail the Effect. */
  readonly required?: boolean;
  readonly fetch?: typeof globalThis.fetch;
};

export class AgentSdkAuditHttpError {
  readonly _tag = "AgentSdkAuditHttpError";
  constructor(readonly reason: string) {}
}

/** POST one WORM append body to clawql-audit HTTP `/entries`. */
export const postWormAppendHttpEffect = (
  entry: WORMAppendInput,
  config: AgentSdkAuditHttpConfig
): Effect.Effect<void, AgentSdkAuditHttpError> =>
  Effect.gen(function* () {
    const base = config.baseUrl.replace(/\/$/, "").trim();
    const key = config.apiKey.trim();
    if (!base || !key) {
      if (config.required) {
        return yield* Effect.fail(
          new AgentSdkAuditHttpError("CLAWQL_AUDIT_URL / API key missing (required)")
        );
      }
      return;
    }
    const fetchImpl = config.fetch ?? globalThis.fetch;
    const result = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetchImpl(`${base}/entries`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `ApiKey ${key}`,
          },
          body: JSON.stringify(entry),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return { ok: false as const, status: res.status, text };
        }
        return { ok: true as const };
      },
      catch: (e) => new AgentSdkAuditHttpError(e instanceof Error ? e.message : String(e)),
    });
    if (!result.ok) {
      const msg = `clawql-audit HTTP ${result.status}: ${result.text.slice(0, 200)}`;
      if (config.required) {
        return yield* Effect.fail(new AgentSdkAuditHttpError(msg));
      }
    }
  });

export const appendAgentSdkHookHttpEffect = (
  event: AgentSdkHookEvent,
  config: AgentSdkAuditHttpConfig,
  agentName = "agent-sdk"
): Effect.Effect<void, AgentSdkAuditHttpError> =>
  Effect.gen(function* () {
    const rows = yield* agentSdkEventToWormAppendsEffect(event, agentName);
    for (const row of rows) {
      yield* postWormAppendHttpEffect(row, config);
    }
  });
