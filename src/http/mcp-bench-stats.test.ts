import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { benchStatsEnabled, collectMcpBenchStats } from "./mcp-bench-stats.js";
import { resolveSessionIdleMs, startSessionIdleWatcher } from "./mcp-session-idle.js";

describe("mcp-bench-stats", () => {
  it("benchStatsEnabled reads CLAWQL_BENCH_STATS", () => {
    expect(Effect.runSync(benchStatsEnabled({ CLAWQL_BENCH_STATS: "1" }))).toBe(true);
    expect(Effect.runSync(benchStatsEnabled({ CLAWQL_BENCH_STATS: "0" }))).toBe(false);
    expect(Effect.runSync(benchStatsEnabled({}))).toBe(false);
  });

  it("collectMcpBenchStats reports zero sessions on empty map", () => {
    const stats = Effect.runSync(collectMcpBenchStats(new Map()));
    expect(stats.mcp_sessions).toBe(0);
    expect(stats.stream_mapping_entries).toBe(0);
    expect(stats.audit_ring_max).toBeGreaterThan(0);
    expect(stats.rss_mb).toBeTypeOf("number");
  });
});

describe("mcp-session-idle", () => {
  it("resolveSessionIdleMs parses env", () => {
    expect(Effect.runSync(resolveSessionIdleMs({ CLAWQL_MCP_SESSION_IDLE_MS: "1500" }))).toBe(
      1500
    );
    expect(Effect.runSync(resolveSessionIdleMs({}))).toBe(0);
    expect(Effect.runSync(resolveSessionIdleMs({ CLAWQL_MCP_SESSION_IDLE_MS: "0" }))).toBe(0);
  });

  it("startSessionIdleWatcher no-ops when idleMs is 0", () => {
    const handle = Effect.runSync(startSessionIdleWatcher(new Map(), 0));
    expect(handle).toBeNull();
  });

  it("evicts idle sessions", async () => {
    const closed: string[] = [];
    const transports = new Map<string, { close: () => Promise<void> }>();
    transports.set("abc", {
      close: async () => {
        closed.push("abc");
        transports.delete("abc");
      },
    });
    const handle = Effect.runSync(
      startSessionIdleWatcher(
        transports as unknown as Map<
          string,
          import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport
        >,
        50,
        { tickMs: 20, log: () => undefined }
      )
    );
    expect(handle).not.toBeNull();
    handle!.touch("abc");
    await new Promise((r) => setTimeout(r, 30));
    expect(transports.has("abc")).toBe(true);
    await new Promise((r) => setTimeout(r, 80));
    expect(closed).toContain("abc");
    expect(transports.has("abc")).toBe(false);
    handle!.stop();
  });
});
