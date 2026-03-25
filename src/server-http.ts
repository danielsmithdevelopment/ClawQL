/**
 * server-http.ts — ClawQL MCP Server over Streamable HTTP
 *
 * Remote MCP entrypoint for agents that connect via URL.
 * Exposes MCP on /mcp and health on /healthz.
 */

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadSpec } from "./spec-loader.js";
import { preloadSchemaFieldCacheFromDisk, registerTools } from "./tools.js";

const PORT = Number.parseInt(process.env.PORT ?? process.env.MCP_PORT ?? "8080", 10);
const MCP_PATH = process.env.MCP_PATH?.trim() || "/mcp";
const transports = new Map<string, StreamableHTTPServerTransport>();

function buildServer(): McpServer {
  const server = new McpServer({
    name: "clawql-mcp",
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}

function jsonRpcError(res: import("express").Response, message: string, code = -32000): void {
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

async function main() {
  // Preload bundled specs / caches so first remote call is fast.
  await loadSpec();
  await preloadSchemaFieldCacheFromDisk();

  const app = createMcpExpressApp({
    host: process.env.MCP_HOST || "0.0.0.0",
  });

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", transport: "streamable-http", endpoint: MCP_PATH });
  });

  app.post(MCP_PATH, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) transports.delete(sid);
        };

        const server = buildServer();
        await server.connect(transport);
      } else {
        jsonRpcError(
          res,
          "Bad Request: missing/invalid mcp-session-id, or initialize request required."
        );
        return;
      }

      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error("[clawql-mcp-http] POST /mcp error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get(MCP_PATH, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete(MCP_PATH, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.listen(PORT, () => {
    console.error(
      `[clawql-mcp-http] Streamable HTTP MCP listening on http://0.0.0.0:${PORT}${MCP_PATH}`
    );
  });
}

main().catch((err) => {
  console.error("[clawql-mcp-http] Fatal startup error:", err);
  process.exit(1);
});
