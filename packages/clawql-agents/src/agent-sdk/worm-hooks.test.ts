import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  AgentSdkAuditHttpError,
  agentSdkEventToWormAppend,
  agentSdkEventToWormAppendsEffect,
  postWormAppendHttpEffect,
} from "./worm-hooks.js";

describe("agentSdkEventToWormAppend", () => {
  it("maps session.started to SESSION_START", () => {
    const row = agentSdkEventToWormAppend({
      kind: "session.started",
      sessionId: "s1",
      channelId: "slack",
    });
    expect(row.type).toBe("SESSION_START");
    expect(row.sessionId).toBe("s1");
    expect(row.agentName).toBe("agent-sdk");
    expect(row.metadata?.channelId).toBe("slack");
  });

  it("maps approval deny to HUMAN_REJECTION", () => {
    const row = agentSdkEventToWormAppend({
      kind: "action.approval_resolved",
      sessionId: "s1",
      callId: "c1",
      toolName: "execute",
      decision: "deny",
    });
    expect(row.type).toBe("HUMAN_REJECTION");
  });

  it("expands actions.requested into one row per call", async () => {
    const rows = await Effect.runPromise(
      agentSdkEventToWormAppendsEffect({
        kind: "actions.requested",
        sessionId: "s1",
        calls: [
          { callId: "a", toolName: "search" },
          { callId: "b", toolName: "execute" },
        ],
      })
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.metadata?.toolName).toBe("search");
    expect(rows[1]?.metadata?.toolName).toBe("execute");
    expect(rows.every((r) => r.type === "TOOL_CALL_ATTEMPT")).toBe(true);
  });
});

describe("postWormAppendHttpEffect", () => {
  it("fails closed when required and URL missing", async () => {
    const result = await Effect.runPromise(
      postWormAppendHttpEffect(
        {
          type: "SESSION_START",
          timestamp: new Date().toISOString(),
          sessionId: "s1",
        },
        { baseUrl: "", apiKey: "", required: true }
      ).pipe(Effect.result)
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(AgentSdkAuditHttpError);
    }
  });

  it("POSTs to /entries with ApiKey auth", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: "e1" }), { status: 201 });
    };
    await Effect.runPromise(
      postWormAppendHttpEffect(
        {
          type: "SESSION_START",
          timestamp: "2026-01-01T00:00:00.000Z",
          sessionId: "s1",
          agentName: "agent-sdk",
        },
        {
          baseUrl: "http://audit.example",
          apiKey: "secret",
          required: true,
          fetch: fetchMock,
        }
      )
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://audit.example/entries");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "ApiKey secret",
    });
  });
});
