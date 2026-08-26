import { describe, expect, it } from "vitest";
import {
  buildContextFlamegraph,
  coalesceFramesBySource,
  demoCompressedVsFatRecords,
  estimateTokensFromChars,
  resolveTraceRecords,
  DEMO_TRACE_SESSION_COMPRESSED,
  DEMO_TRACE_SESSION_FAT,
  type TraceCallRecord,
} from "./mcp-ui-trace.js";
import {
  renderContextFlamegraphPage,
  renderTraceNotFoundPage,
} from "./mcp-ui-trace-html.js";
import { attachMcpUiRoutes } from "./mcp-ui-http.js";
import express from "express";
import type { Server } from "node:http";
import type { ListedMcpTool } from "./types.js";

describe("estimateTokensFromChars", () => {
  it("ceil-divides by 4 with a floor of 1 for non-empty", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
  });
});

describe("buildContextFlamegraph", () => {
  it("classifies system vault seed vs harness and scales to usage.inputTokens", () => {
    const records: TraceCallRecord[] = [
      {
        id: "call-1",
        timestamp: "2026-08-26T12:00:00.000Z",
        modelId: "demo",
        messages: [
          {
            role: "system",
            content: "Harness rules. Prefer search then execute.",
          },
          {
            role: "system",
            content: "Obsidian vault memory: [[Agent.md]] system-seed notes.",
          },
          { role: "user", content: "hello" },
          { role: "tool", content: '{"ok":true}' },
        ],
        response: "done",
        usage: { inputTokens: 400, outputTokens: 10 },
      },
    ];
    const graph = buildContextFlamegraph("s1", records);
    expect(graph.calls).toBe(1);
    expect(graph.totalInputTokens).toBe(400);
    expect(graph.totalOutputTokens).toBe(10);
    expect(graph.bySource.harness_prompt).toBeGreaterThan(0);
    expect(graph.bySource.vault_seed).toBeGreaterThan(0);
    expect(graph.bySource.tool_result).toBeGreaterThan(0);
    expect(graph.bySource.model_output).toBe(10);
    expect(graph.turns[0]!.frames.some((f) => f.source === "harness_prompt")).toBe(true);
    expect(graph.turns[0]!.frames.some((f) => f.source === "vault_seed")).toBe(true);
  });

  it("shows compressed demo much smaller than fat demo", async () => {
    const compressed = await resolveTraceRecords(DEMO_TRACE_SESSION_COMPRESSED);
    const fat = await resolveTraceRecords(DEMO_TRACE_SESSION_FAT);
    expect(compressed).not.toBeNull();
    expect(fat).not.toBeNull();
    const c = buildContextFlamegraph(DEMO_TRACE_SESSION_COMPRESSED, compressed!);
    const f = buildContextFlamegraph(DEMO_TRACE_SESSION_FAT, fat!);
    expect(c.totalInputTokens).toBeLessThan(f.totalInputTokens / 3);
    expect(f.bySource.tool_result).toBeGreaterThan(c.bySource.tool_result);
  });

  it("coalesceFramesBySource merges adjacent same sources", () => {
    const { compressed } = demoCompressedVsFatRecords("x");
    const graph = buildContextFlamegraph("x", compressed);
    const coalesced = coalesceFramesBySource(graph.turns[0]!.frames);
    expect(coalesced.length).toBeLessThanOrEqual(graph.turns[0]!.frames.length);
  });
});

describe("renderContextFlamegraphPage", () => {
  it("escapes session id and includes stacked bars", () => {
    const { compressed } = demoCompressedVsFatRecords("demo<script>");
    const graph = buildContextFlamegraph("demo<script>", compressed);
    const html = renderContextFlamegraphPage(graph, { basePath: "/mcp-ui" });
    expect(html).toContain("demo&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("fg-bar");
    expect(html).toContain("Context accumulation flamegraph");
    expect(html).toContain("?format=json");
  });

  it("renderTraceNotFoundPage links demos", () => {
    const html = renderTraceNotFoundPage("missing", { basePath: "/mcp-ui" });
    expect(html).toContain("demo-compressed");
    expect(html).toContain("No trace for session");
  });
});

describe("GET /mcp-ui/trace/:sessionId", () => {
  async function listen(
    listTraceCalls?: (id: string) => TraceCallRecord[]
  ): Promise<{ base: string; close: () => Promise<void> }> {
    const app = express();
    attachMcpUiRoutes(app, {
      path: "/mcp-ui",
      listTraceCalls,
      getCatalog: () => ({
        tools: [] as ListedMcpTool[],
        fetchedAt: new Date().toISOString(),
        upstream: "test",
        upstreamKind: "http",
        surfaces: ["mcp-ui"],
      }),
      callTool: async () => ({ content: [], isError: false }),
    });
    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    return {
      base: `http://127.0.0.1:${addr.port}`,
      close: () =>
        new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  }

  it("serves demo-compressed HTML and JSON", async () => {
    const { base, close } = await listen();
    try {
      const htmlRes = await fetch(`${base}/mcp-ui/trace/demo-compressed`);
      expect(htmlRes.status).toBe(200);
      const html = await htmlRes.text();
      expect(html).toContain("Context accumulation flamegraph");
      expect(html).toContain("demo-compressed");
      expect(html).toContain("fg-seg");

      const jsonRes = await fetch(`${base}/mcp-ui/trace/demo-compressed?format=json`);
      expect(jsonRes.status).toBe(200);
      const graph = (await jsonRes.json()) as { totalInputTokens: number; sessionId: string };
      expect(graph.sessionId).toBe("demo-compressed");
      expect(graph.totalInputTokens).toBeGreaterThan(0);

      const fat = await fetch(`${base}/mcp-ui/trace/demo-fat?format=json`);
      const fatGraph = (await fat.json()) as { totalInputTokens: number };
      expect(fatGraph.totalInputTokens).toBeGreaterThan(graph.totalInputTokens);
    } finally {
      await close();
    }
  });

  it("404 when session missing and no injector", async () => {
    const { base, close } = await listen();
    try {
      const res = await fetch(`${base}/mcp-ui/trace/unknown-session`);
      expect(res.status).toBe(404);
      expect(await res.text()).toContain("No trace for session");
    } finally {
      await close();
    }
  });

  it("uses listTraceCalls for live sessions", async () => {
    const { compressed } = demoCompressedVsFatRecords("live-1");
    const { base, close } = await listen((id) => (id === "live-1" ? compressed : []));
    try {
      const res = await fetch(`${base}/mcp-ui/trace/live-1?format=json`);
      expect(res.status).toBe(200);
      const graph = (await res.json()) as { calls: number; sessionId: string };
      expect(graph.sessionId).toBe("live-1");
      expect(graph.calls).toBe(2);
    } finally {
      await close();
    }
  });

  it("GET /mcp-ui/trace/compare side-by-side JSON", async () => {
    const { base, close } = await listen();
    try {
      const res = await fetch(`${base}/mcp-ui/trace/compare?format=json`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        compressed: { totalInputTokens: number };
        fat: { totalInputTokens: number; bySource: { tool_result: number } };
      };
      expect(data.fat.totalInputTokens).toBeGreaterThan(data.compressed.totalInputTokens * 5);
      expect(data.fat.bySource.tool_result).toBeGreaterThan(10_000);
      const html = await fetch(`${base}/mcp-ui/trace/compare`);
      expect(html.status).toBe(200);
      const body = await html.text();
      expect(body).toContain("Both-sides compression");
      expect(body).toContain("fg-compare");
    } finally {
      await close();
    }
  });
});
