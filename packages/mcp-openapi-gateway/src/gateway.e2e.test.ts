import { afterEach, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  maybeStartGrpcMcpServer,
  type StartedGrpcServer,
} from "mcp-grpc-transport";
import { startMcpOpenApiGateway, type StartedMcpOpenApiGateway } from "./server.js";

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

describe("mcp-openapi-gateway e2e (OpenAPI + gRPC)", () => {
  let grpc: StartedGrpcServer | undefined;
  let gateway: StartedMcpOpenApiGateway | undefined;
  const saved = { ...process.env };

  afterEach(async () => {
    process.env = { ...saved };
    await gateway?.close();
    gateway = undefined;
    await grpc?.shutdown();
    grpc = undefined;
  });

  it("serves the same tool results over REST and gRPC", async () => {
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";

    grpc = await maybeStartGrpcMcpServer({
      createMcpServer: createDemoMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!grpc) throw new Error("expected gRPC server");

    gateway = await startMcpOpenApiGateway({
      grpcAddress: grpc.address,
      host: "127.0.0.1",
      port: 0,
      title: "e2e demo",
    });

    const toolsRes = await fetch(`${gateway.url}/tools`);
    expect(toolsRes.status).toBe(200);
    const toolsBody = (await toolsRes.json()) as { tools: { name: string }[] };
    expect(toolsBody.tools.map((t) => t.name).sort()).toEqual(["add", "echo"]);

    const openapiRes = await fetch(`${gateway.url}/openapi.json`);
    expect(openapiRes.status).toBe(200);
    const openapi = (await openapiRes.json()) as {
      info: { "x-clawql-grpc"?: { package?: string } };
      paths: Record<string, unknown>;
    };
    expect(openapi.info["x-clawql-grpc"]?.package).toBe("mcp-grpc-transport");
    expect(openapi.paths["/echo"]).toBeTruthy();
    expect(openapi.paths["/add"]).toBeTruthy();

    const restEcho = await fetch(`${gateway.url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "hello-openapi" }),
    });
    expect(restEcho.status).toBe(200);
    const restEchoBody = (await restEcho.json()) as { echo?: string };
    expect(restEchoBody.echo).toBe("hello-openapi");

    const grpcMsgs = await callToolServerStreamingGrpc({
      address: grpc.address,
      toolName: "echo",
      arguments: { message: "hello-grpc" },
    });
    const grpcText = lastNonEmptyCallToolText(grpcMsgs);
    expect(grpcText).toContain("hello-grpc");

    const restAdd = await fetch(`${gateway.url}/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 2, b: 40 }),
    });
    expect(restAdd.status).toBe(200);
    const restAddBody = (await restAdd.json()) as { sum?: number };
    expect(restAddBody.sum).toBe(42);

    const grpcAdd = await callToolServerStreamingGrpc({
      address: grpc.address,
      toolName: "add",
      arguments: { a: 2, b: 40 },
    });
    expect(JSON.parse(lastNonEmptyCallToolText(grpcAdd))).toEqual({ sum: 42 });
  });
});

