import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  maybeStartGrpcMcpServer,
  type StartedGrpcServer,
} from "mcp-grpc-transport";
import { startMcpApiAdapter, type StartedMcpApiAdapter } from "./server.js";
import { collapseSdkToolResult } from "./call.js";

function createDemoMcpServer(): McpServer {
  const server = new McpServer({ name: "openapi-gateway-e2e", version: "0.0.0" });
  server.tool(
    "echo",
    "Echo a message back",
    { message: z.string().describe("Text to echo") },
    async ({ message }) => ({
      content: [{ type: "text", text: JSON.stringify({ echo: message }) }],
      structuredContent: { echo: message },
    })
  );
  server.tool(
    "add",
    "Add two numbers",
    {
      a: z.number().describe("First addend"),
      b: z.number().describe("Second addend"),
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: JSON.stringify({ sum: a + b }) }],
      structuredContent: { sum: a + b },
    })
  );
  return server;
}

async function startStreamableHttpUpstream(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const httpServer: HttpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/mcp") {
        res.writeHead(404).end();
        return;
      }
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined;
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (req.method === "POST" && !sessionId) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport!);
          },
        });
        transport.onclose = () => {
          const id = transport?.sessionId;
          if (id) transports.delete(id);
        };
        const mcp = createDemoMcpServer();
        await mcp.connect(transport);
      } else {
        res.writeHead(400).end("Invalid session");
        return;
      }
      await transport!.handleRequest(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
    httpServer.on("error", reject);
  });
  const addr = httpServer.address();
  if (!addr || typeof addr === "string") throw new Error("no listen address");
  return {
    url: `http://127.0.0.1:${addr.port}/mcp`,
    close: async () => {
      for (const t of transports.values()) await t.close().catch(() => {});
      await new Promise<void>((resolve, reject) => {
        httpServer.close((e) => (e ? reject(e) : resolve()));
      });
    },
  };
}

describe("mcp-api-adapter e2e (gRPC upstream)", () => {
  let grpc: StartedGrpcServer | undefined;
  let gateway: StartedMcpApiAdapter | undefined;
  const saved = { ...process.env };

  afterEach(async () => {
    process.env = { ...saved };
    await gateway?.close();
    gateway = undefined;
    await grpc?.shutdown();
    grpc = undefined;
  });

  it("serves the same tool results over REST, GraphQL, gRPC, and /mcp", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    grpc = await maybeStartGrpcMcpServer({
      createMcpServer: createDemoMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!grpc) throw new Error("expected gRPC server");

    gateway = await startMcpApiAdapter({
      upstream: { kind: "grpc", address: grpc.address },
      host: "127.0.0.1",
      port: 0,
      title: "e2e demo",
      grpcListen: false,
      mcpPath: "/mcp",
    });

    const toolsRes = await fetch(`${gateway.url}/tools`);
    expect(toolsRes.status).toBe(200);
    const toolsBody = (await toolsRes.json()) as {
      tools: { name: string }[];
      upstreamKind: string;
      surfaces: string[];
    };
    expect(toolsBody.upstreamKind).toBe("grpc");
    expect(toolsBody.surfaces).toEqual(["openapi", "graphql", "mcp", "grpc", "websocket"]);
    expect(toolsBody.tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);

    const restEcho = await fetch(`${gateway.url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello-openapi" }),
    });
    expect(restEcho.status).toBe(200);
    expect(((await restEcho.json()) as { echo?: string }).echo).toBe("hello-openapi");

    const grpcMsgs = await callToolServerStreamingGrpc({
      address: grpc.address,
      toolName: "echo",
      arguments: { message: "hello-grpc" },
    });
    expect(lastNonEmptyCallToolText(grpcMsgs)).toContain("hello-grpc");

    const gqlEcho = await fetch(`${gateway.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: "mutation($m: String!) { echo(message: $m) }",
        variables: { m: "hello-graphql" },
      }),
    });
    const gqlEchoBody = (await gqlEcho.json()) as {
      data?: { echo?: { echo?: string } };
      errors?: unknown[];
    };
    expect(gqlEchoBody.errors).toBeUndefined();
    expect(gqlEchoBody.data?.echo?.echo).toBe("hello-graphql");

    // gRPC upstream → Streamable HTTP /mcp (protobuf content must be normalized)
    const mcpClient = new Client({ name: "e2e-grpc-mcp", version: "0.0.0" });
    const mcpTransport = new StreamableHTTPClientTransport(
      new URL(`${gateway.url}${gateway.mcpPath}`)
    );
    await mcpClient.connect(mcpTransport);
    try {
      const result = await mcpClient.callTool({
        name: "echo",
        arguments: { message: "hello-mcp-over-grpc" },
      });
      const collapsed = collapseSdkToolResult(result);
      expect(collapsed.structuredContent?.echo).toBe("hello-mcp-over-grpc");
    } finally {
      await mcpClient.close().catch(() => {});
      await mcpTransport.close().catch(() => {});
    }
  });
});

describe("mcp-api-adapter e2e (HTTP upstream → scaffold OpenAPI+GraphQL+gRPC)", () => {
  let upstream: { url: string; close: () => Promise<void> } | undefined;
  let gateway: StartedMcpApiAdapter | undefined;
  const saved = { ...process.env };

  afterEach(async () => {
    process.env = { ...saved };
    await gateway?.close();
    gateway = undefined;
    await upstream?.close();
    upstream = undefined;
  });

  it("wraps Streamable HTTP MCP and exposes REST, GraphQL, /mcp, and scaffolded gRPC", async () => {
    process.env.ENABLE_GRPC_REFLECTION = "0";
    upstream = await startStreamableHttpUpstream();

    gateway = await startMcpApiAdapter({
      upstream: { kind: "http", url: upstream.url },
      host: "127.0.0.1",
      port: 0,
      title: "http-upstream e2e",
      grpcListen: "127.0.0.1:0",
      mcpPath: "/mcp",
    });

    expect(gateway.upstreamKind).toBe("http");
    expect(gateway.grpcAddress).toBeTruthy();
    expect(gateway.mcpPath).toBe("/mcp");

    const health = await fetch(`${gateway.url}/healthz`);
    const healthBody = (await health.json()) as {
      surfaces: string[];
      upstreamKind: string;
      mcpPath?: string;
    };
    expect(healthBody.upstreamKind).toBe("http");
    expect(healthBody.mcpPath).toBe("/mcp");
    expect(healthBody.surfaces).toEqual(["openapi", "graphql", "mcp", "grpc", "websocket"]);

    const restAdd = await fetch(`${gateway.url}/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 2, b: 40 }),
    });
    expect(restAdd.status).toBe(200);
    expect(((await restAdd.json()) as { sum?: number }).sum).toBe(42);

    const gqlAdd = await fetch(`${gateway.url}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "mutation { add(a: 2, b: 40) }" }),
    });
    const gqlBody = (await gqlAdd.json()) as {
      data?: { add?: { sum?: number } };
      errors?: unknown[];
    };
    expect(gqlBody.errors).toBeUndefined();
    expect(gqlBody.data?.add?.sum).toBe(42);

    const grpcAdd = await callToolServerStreamingGrpc({
      address: gateway.grpcAddress!,
      toolName: "add",
      arguments: { a: 2, b: 40 },
    });
    expect(JSON.parse(lastNonEmptyCallToolText(grpcAdd))).toEqual({ sum: 42 });

    const mcpClient = new Client({ name: "e2e-mcp-client", version: "0.0.0" });
    const mcpTransport = new StreamableHTTPClientTransport(
      new URL(`${gateway.url}${gateway.mcpPath}`)
    );
    await mcpClient.connect(mcpTransport);
    try {
      const listed = await mcpClient.listTools();
      expect(listed.tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);
      const result = await mcpClient.callTool({
        name: "echo",
        arguments: { message: "via-mcp-http" },
      });
      const collapsed = collapseSdkToolResult(result);
      expect(collapsed.structuredContent?.echo).toBe("via-mcp-http");
    } finally {
      await mcpClient.close().catch(() => {});
      await mcpTransport.close().catch(() => {});
    }
  });
});
