/**
 * Agent SDK hook → clawql-audit WORM (HTTP POST /entries).
 *
 * Copy to: bot/hooks/clawql-audit.ts
 *
 * Env (resolved at event time — OK to read process.env in handlers):
 *   CLAWQL_AUDIT_URL       base URL of clawql-audit HTTP (no trailing slash)
 *   CLAWQL_AUDIT_API_KEY   Authorization: ApiKey …
 *   CLAWQL_AUDIT_REQUIRED  when "1", throw on append failure (loud fail-closed)
 *
 * Honesty: Agent SDK hooks are observe-only — they cannot veto a turn. Fail-closed
 * here means "do not silently drop compliance events"; pair with startup checks
 * and server-side mandates for real enforcement.
 *
 * Prefer mapping via clawql-agents `agentSdkEventToWormAppend` in production code;
 * this file inlines a minimal mapper so the example has no monorepo import.
 *
 * @see packages/clawql-agents/src/agent-sdk/worm-hooks.ts
 */
import { defineHook } from "@grok/agent-sdk/hooks";

type WormAppendBody = {
  type: string;
  timestamp: string;
  sessionId: string;
  agentName?: string;
  metadata?: Record<string, unknown>;
};

function mapEvent(
  type: string,
  sessionId: string,
  metadata?: Record<string, unknown>
): WormAppendBody {
  return {
    type,
    timestamp: new Date().toISOString(),
    sessionId,
    agentName: "agent-sdk",
    metadata,
  };
}

async function appendWorm(entry: WormAppendBody): Promise<void> {
  const base = process.env.CLAWQL_AUDIT_URL?.replace(/\/$/, "");
  const key = process.env.CLAWQL_AUDIT_API_KEY?.trim();
  const required = process.env.CLAWQL_AUDIT_REQUIRED === "1";

  if (!base || !key) {
    if (required) {
      throw new Error("CLAWQL_AUDIT_REQUIRED=1 but CLAWQL_AUDIT_URL / CLAWQL_AUDIT_API_KEY unset");
    }
    return;
  }

  const res = await fetch(`${base}/entries`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `ApiKey ${key}`,
    },
    body: JSON.stringify(entry),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = `clawql-audit append failed: HTTP ${res.status} ${text.slice(0, 200)}`;
    if (required) throw new Error(msg);
    console.error(msg);
  }
}

export default defineHook({
  events: {
    async "session.started"(event, ctx) {
      await appendWorm(
        mapEvent("SESSION_START", ctx.session.id, {
          channelId: event.data.channelId,
          dryRun: event.data.dryRun,
        })
      );
    },
    async "session.completed"(_event, ctx) {
      await appendWorm(mapEvent("SESSION_END", ctx.session.id, { outcome: "completed" }));
    },
    async "session.failed"(event, ctx) {
      await appendWorm(
        mapEvent("SESSION_END", ctx.session.id, {
          outcome: "failed",
          message: event.data.message,
        })
      );
    },
    async "actions.requested"(event, ctx) {
      for (const call of event.data.calls) {
        await appendWorm(
          mapEvent("TOOL_CALL_ATTEMPT", ctx.session.id, {
            callId: call.callId,
            toolName: call.toolName,
            parentCallId: call.parentCallId,
            modelCallId: call.modelCallId,
          })
        );
      }
    },
    async "action.result"(event, ctx) {
      await appendWorm(
        mapEvent("TOOL_CALL_RESULT", ctx.session.id, {
          callId: event.data.callId,
          toolName: event.data.toolName,
          isError: event.data.isError,
          stubbed: event.data.stubbed,
        })
      );
    },
    async "action.approval_requested"(event, ctx) {
      await appendWorm(
        mapEvent("HUMAN_DECISION_REQUESTED", ctx.session.id, {
          callId: event.data.callId,
          toolName: event.data.toolName,
        })
      );
    },
    async "action.approval_resolved"(event, ctx) {
      const approved = event.data.decision === "approve";
      await appendWorm(
        mapEvent(approved ? "HUMAN_APPROVAL" : "HUMAN_REJECTION", ctx.session.id, {
          callId: event.data.callId,
          toolName: event.data.toolName,
          decision: event.data.decision,
          by: event.data.by,
        })
      );
    },
    async "turn.failed"(event, ctx) {
      await appendWorm(
        mapEvent("AGENT_OBSERVATION", ctx.session.id, {
          kind: "turn.failed",
          message: event.data.message,
          status: event.data.status,
        })
      );
    },
  },
});
