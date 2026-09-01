import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createListTraceCallsFromStore,
  inferenceRecordsToTraceCalls,
  resolveListTraceCallsFromEnv,
} from "./inference-trace-bridge.js";
import { buildContextFlamegraph } from "./mcp-ui-trace.js";
import { attachMcpUiRoutes } from "./mcp-ui-http.js";
import type { ListedMcpTool } from "./types.js";

describe("inferenceRecordsToTraceCalls", () => {
  it("maps clawql-inference records to trace shape", () => {
    const out = inferenceRecordsToTraceCalls([
      {
        id: "r1",
        correlationId: "sess-a",
        timestamp: "2026-08-26T12:00:00.000Z",
        modelId: "openai/gpt-4o",
        provider: "openai",
        messages: [
          { role: "system", content: "Harness rules.", tokens: 12 },
          { role: "user", content: "hi", tokens: 5 },
        ],
        response: "hello",
        usage: { inputTokens: 100, outputTokens: 3 },
        latencyMs: 50,
      },
    ]);
    expect(out[0]?.correlationId).toBe("sess-a");
    expect(out[0]?.messages[0]?.tokens).toBe(12);
    expect(out[0]?.usage?.inputTokens).toBe(100);
  });
});

describe("createListTraceCallsFromStore", () => {
  it("loads records by correlation id", async () => {
    const store = {
      getByCorrelationId: async (id: string) =>
        id === "live-9"
          ? [
              {
                id: "c1",
                correlationId: "live-9",
                timestamp: "2026-08-26T12:00:00.000Z",
                modelId: "demo",
                messages: [{ role: "user", content: "x" }],
                response: "y",
              },
            ]
          : [],
    };
    const list = createListTraceCallsFromStore(store);
    const records = await list("live-9");
    expect(records).toHaveLength(1);
    const graph = buildContextFlamegraph("live-9", records);
    expect(graph.calls).toBe(1);
  });
});

describe("resolveListTraceCallsFromEnv + GET /mcp-ui/trace", () => {
  const envKeys = [
    "MCP_API_ADAPTER_INFERENCE_TRACE",
    "CLAWQL_INFERENCE_STORE",
    "CLAWQL_INFERENCE_STORE_PATH",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  let tempDir = "";

  afterEach(async () => {
    for (const key of envKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  async function listenWithTrace(
    listTraceCalls: (id: string) => Promise<unknown[]>
  ): Promise<{ base: string; close: () => Promise<void> }> {
    const app = express();
    attachMcpUiRoutes(app, {
      path: "/mcp-ui",
      listTraceCalls: listTraceCalls as never,
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

  it("reads shared JSONL store via env and serves flamegraph JSON", async () => {
    for (const key of envKeys) saved[key] = process.env[key];
    tempDir = await mkdtemp(join(tmpdir(), "clawql-trace-"));
    const jsonlPath = join(tempDir, "calls.jsonl");
    const record = {
      id: "rec-jsonl-1",
      correlationId: "bench-session-42",
      timestamp: "2026-08-26T15:00:00.000Z",
      modelId: "openai/gpt-4o-mini",
      provider: "openai",
      messages: [
        { role: "system", content: "Harness rules for agent.", tokens: 40 },
        { role: "tool", content: '{"compressed":true}', tokens: 81 },
      ],
      response: "done",
      usage: { inputTokens: 200, outputTokens: 10 },
      latencyMs: 120,
      evaluatorVerdict: "none",
    };
    await writeFile(jsonlPath, `${JSON.stringify(record)}\n`, "utf8");

    process.env.MCP_API_ADAPTER_INFERENCE_TRACE = "1";
    process.env.CLAWQL_INFERENCE_STORE = "jsonl";
    process.env.CLAWQL_INFERENCE_STORE_PATH = jsonlPath;

    const listTraceCalls = await resolveListTraceCallsFromEnv(process.env);
    expect(listTraceCalls).toBeTypeOf("function");

    const { base, close } = await listenWithTrace(listTraceCalls!);
    try {
      const res = await fetch(`${base}/mcp-ui/trace/bench-session-42?format=json`);
      expect(res.status).toBe(200);
      const graph = (await res.json()) as {
        sessionId: string;
        calls: number;
        totalInputTokens: number;
        bySource: { tool_result: number; harness_prompt: number };
        tokenization?: { encoding?: string };
      };
      expect(graph.sessionId).toBe("bench-session-42");
      expect(graph.calls).toBe(1);
      expect(graph.totalInputTokens).toBe(200);
      expect(graph.bySource.tool_result).toBeGreaterThan(0);
      expect(graph.tokenization?.encoding).toBe("cl100k_base");
    } finally {
      await close();
    }
  });

  it("returns undefined when inference trace disabled", async () => {
    for (const key of envKeys) saved[key] = process.env[key];
    delete process.env.MCP_API_ADAPTER_INFERENCE_TRACE;
    process.env.CLAWQL_INFERENCE_STORE = "off";
    const list = await resolveListTraceCallsFromEnv(process.env);
    expect(list).toBeUndefined();
  });
});
