import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { maybeStartGrpcMcpServer } from "./server.js";
import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  mcpArgumentsToCallToolStructFields,
} from "./grpc-call-tool-client.js";

function createEchoMcpServer(): McpServer {
  const s = new McpServer({ name: "grpc-call-tool-client-test", version: "0.0.0" });
  s.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo arbitrary JSON arguments as tool text.",
      inputSchema: { payload: z.record(z.string(), z.unknown()) },
    },
    async ({ payload }: { payload: Record<string, unknown> }) => ({
      content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    })
  );
  return s;
}

describe("grpc-call-tool-client", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("mcpArgumentsToCallToolStructFields preserves nested maps for protobufjs", () => {
    const fields = mcpArgumentsToCallToolStructFields({
      operationId: "tika_parse_put",
      args: { body: "QUJD", bodyEncoding: "base64", nested: { x: 1 } },
    });
    expect(fields.operationId).toMatchObject({ stringValue: "tika_parse_put", kind: "stringValue" });
    expect(
      (fields.args as { structValue?: { fields?: Record<string, unknown> } }).structValue?.fields
    ).toBeDefined();
    const inner = (fields.args as { structValue: { fields: Record<string, unknown> } }).structValue
      .fields;
    expect(inner.body).toMatchObject({ stringValue: "QUJD", kind: "stringValue" });
    expect(inner.nested).toMatchObject({ structValue: expect.any(Object), kind: "structValue" });
  });

  it("callToolServerStreamingGrpc round-trips nested echo args", async () => {
    const started = await maybeStartGrpcMcpServer({
      createMcpServer: createEchoMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected gRPC server");
    try {
      const messages = await callToolServerStreamingGrpc({
        address: started.address,
        toolName: "echo",
        arguments: {
          payload: {
            hello: "world",
            deep: { n: 42, flag: true },
          },
        },
      });
      const text = lastNonEmptyCallToolText(messages);
      const parsed = JSON.parse(text) as { hello?: string; deep?: { n?: number; flag?: boolean } };
      expect(parsed.hello).toBe("world");
      expect(parsed.deep?.n).toBe(42);
      expect(parsed.deep?.flag).toBe(true);
    } finally {
      await started.shutdown();
    }
  }, 25_000);
});
