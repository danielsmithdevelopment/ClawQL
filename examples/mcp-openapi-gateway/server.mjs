#!/usr/bin/env node
/**
 * Example MCP server with **both** surfaces enabled at once:
 *   - gRPC  `model_context_protocol.Mcp` via mcp-grpc-transport (default :50051)
 *   - OpenAPI on-ramp via mcp-openapi-gateway (default :8090)
 *
 * Run from repo root after building packages:
 *   npm run build -w mcp-grpc-transport && npm run build -w mcp-openapi-gateway
 *   node examples/mcp-openapi-gateway/server.mjs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { startMcpOpenApiGateway } from "mcp-openapi-gateway";

function createDemoMcpServer() {
  const server = new McpServer({
    name: "mcp-openapi-gateway-demo",
    version: "0.1.0",
  });

  server.tool(
    "echo",
    "Echo a message back (demo tool)",
    { message: z.string().describe("Text to echo") },
    async ({ message }) => ({
      content: [{ type: "text", text: JSON.stringify({ echo: message }) }],
      structuredContent: { echo: message },
    })
  );

  server.tool(
    "add",
    "Add two numbers (demo tool)",
    {
      a: z.number().describe("First addend"),
      b: z.number().describe("Second addend"),
    },
    async ({ a, b }) => ({
      content: [{ type: "text", text: JSON.stringify({ sum: a + b }) }],
      structuredContent: { sum: a + b },
    })
  );

  server.tool(
    "greet",
    "Return a greeting for a name (demo tool)",
    {
      name: z.string().describe("Who to greet"),
      shout: z.boolean().optional().describe("Uppercase the greeting"),
    },
    async ({ name, shout }) => {
      const greeting = `Hello, ${name}!`;
      const text = shout ? greeting.toUpperCase() : greeting;
      return {
        content: [{ type: "text", text: JSON.stringify({ greeting: text }) }],
        structuredContent: { greeting: text },
      };
    }
  );

  return server;
}

async function main() {
  process.env.ENABLE_GRPC = process.env.ENABLE_GRPC || "1";
  process.env.ENABLE_GRPC_REFLECTION =
    process.env.ENABLE_GRPC_REFLECTION || "1";

  const grpcHost = process.env.GRPC_BIND?.trim() || "127.0.0.1";
  const grpcPort = process.env.GRPC_PORT?.trim() || "50051";
  const openApiHost = process.env.OPENAPI_HOST?.trim() || "127.0.0.1";
  const openApiPort = Number.parseInt(process.env.OPENAPI_PORT?.trim() || "8090", 10);

  const grpc = await maybeStartGrpcMcpServer({
    createMcpServer: createDemoMcpServer,
    bindAddress: `${grpcHost}:${grpcPort}`,
  });
  if (!grpc) {
    throw new Error("gRPC did not start — set ENABLE_GRPC=1");
  }

  const gateway = await startMcpOpenApiGateway({
    grpcAddress: grpc.address,
    host: openApiHost,
    port: openApiPort,
    title: "MCP OpenAPI Gateway demo",
    serverName: "mcp-openapi-gateway-demo",
    apiKey: process.env.MCP_OPENAPI_GATEWAY_API_KEY?.trim() || undefined,
  });

  console.log("");
  console.log("=== MCP OpenAPI + gRPC demo server ===");
  console.log(`gRPC MCP:     ${grpc.address}`);
  console.log(`              service model_context_protocol.Mcp (ListTools / CallTool)`);
  console.log(`OpenAPI:      ${gateway.url}`);
  console.log(`  docs:       ${gateway.url}/docs`);
  console.log(`  openapi:    ${gateway.url}/openapi.json`);
  console.log(`  tools:      ${gateway.url}/tools`);
  console.log(`Tools:        ${gateway.getCatalog().tools.map((t) => t.name).join(", ")}`);
  console.log("");
  console.log("Demos (another terminal):");
  console.log("  node examples/mcp-openapi-gateway/demo-rest.mjs");
  console.log("  node examples/mcp-openapi-gateway/demo-grpc.mjs");
  console.log("  node examples/mcp-openapi-gateway/demo-all.mjs");
  console.log("");

  const shutdown = async () => {
    console.log("\nShutting down…");
    await gateway.close();
    await grpc.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
