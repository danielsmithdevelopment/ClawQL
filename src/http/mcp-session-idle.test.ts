import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  resolveSessionIdleMs,
  resolveSessionMax,
  startSessionIdleWatcher,
} from "./mcp-session-idle.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

describe("mcp-session-idle", () => {
  it("defaults idle to 30 minutes when unset", () => {
    expect(Effect.runSync(resolveSessionIdleMs({}))).toBe(1_800_000);
  });

  it("disables idle when CLAWQL_MCP_SESSION_IDLE_MS=0", () => {
    expect(Effect.runSync(resolveSessionIdleMs({ CLAWQL_MCP_SESSION_IDLE_MS: "0" }))).toBe(0);
  });

  it("defaults session max to 1024", () => {
    expect(Effect.runSync(resolveSessionMax({}))).toBe(1024);
  });

  it("evicts idle sessions on sweep", async () => {
    const closed: string[] = [];
    const transports = new Map<string, StreamableHTTPServerTransport>();
    const make = (id: string): StreamableHTTPServerTransport =>
      ({
        sessionId: id,
        close: async () => {
          closed.push(id);
        },
      }) as unknown as StreamableHTTPServerTransport;

    transports.set("a", make("a"));
    transports.set("b", make("b"));
    const handle = Effect.runSync(
      startSessionIdleWatcher(transports, 50, { tickMs: 60_000, log: () => undefined })
    );
    expect(handle).not.toBeNull();
    handle!.touch("a");
    handle!.touch("b");
    await new Promise((r) => setTimeout(r, 80));
    handle!.touch("a");
    const n = handle!.sweep();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(closed).toContain("b");
    expect(transports.has("a")).toBe(true);
    handle!.stop();
  });
});
