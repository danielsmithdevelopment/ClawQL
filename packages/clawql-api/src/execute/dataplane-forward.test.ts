import { describe, expect, it, beforeEach } from "vitest";
import { Effect } from "effect";
import {
  callDataplaneToolEffect,
  dataplaneForwardEnabled,
  resetDataplaneSessionCache,
  resolveDataplaneForwardConfig,
} from "./dataplane-forward.js";

describe("dataplane forward", () => {
  beforeEach(() => {
    resetDataplaneSessionCache();
  });

  it("disabled without URL", () => {
    expect(dataplaneForwardEnabled({})).toBe(false);
    expect(resolveDataplaneForwardConfig({})).toBeNull();
  });

  it("resolves /mcp suffix", () => {
    const cfg = resolveDataplaneForwardConfig({
      CLAWQL_DATAPLANE_EXECUTE_URL: "http://127.0.0.1:8787",
    });
    expect(cfg?.url).toBe("http://127.0.0.1:8787/mcp");
  });

  it("CLAWQL_DATAPLANE_FORWARD=0 disables", () => {
    expect(
      dataplaneForwardEnabled({
        CLAWQL_DATAPLANE_EXECUTE_URL: "http://x/mcp",
        CLAWQL_DATAPLANE_FORWARD: "0",
      })
    ).toBe(false);
  });

  it("forwards execute after initialize", async () => {
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = String(init?.body ?? "");
      const headers = Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ])
      );
      calls.push({ url, body, headers });
      if (body.includes('"initialize"')) {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), {
          status: 200,
          headers: { "mcp-session-id": "sess-1", "content-type": "application/json" },
        });
      }
      if (body.includes("notifications/initialized")) {
        return new Response(null, { status: 202 });
      }
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [{ type: "text", text: JSON.stringify({ ok: true, operationId: "zones-get" }) }],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    const out = await Effect.runPromise(
      callDataplaneToolEffect(
        "execute",
        { operationId: "zones-get", args: {} },
        { CLAWQL_DATAPLANE_EXECUTE_URL: "http://dp:8787/mcp" },
        fetchImpl
      )
    );
    expect(out.transport).toBe("dataplane-forward");
    expect(calls.some((c) => c.body.includes("initialize"))).toBe(true);
    expect(calls.some((c) => c.body.includes("tools/call"))).toBe(true);
    const toolCall = calls.find((c) => c.body.includes("tools/call"));
    expect(toolCall?.headers["mcp-session-id"]).toBe("sess-1");
    const parsed = JSON.parse(out.content[0].text) as { ok: boolean; proxiedFrom?: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.proxiedFrom).toBe("clawql-mcp");
  });
});
