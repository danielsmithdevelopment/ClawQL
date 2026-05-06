#!/usr/bin/env node
/**
 * Plain Node subprocess: minimal upstream MCP + bridge (`CLAWQL_BRIDGE_DIRECT_SHIM=1`) + listTools.
 * Run after `npm run build -w panguard-mcp-bridge` from repo root (or any cwd; resolves dist via import.meta.url).
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createPanguardBridgeApp } from "../dist/gateway-main.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shimPath = join(__dirname, "../dist/shim-main.js");

function jsonRpcError(res, message) {
  res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

async function startMinimalUpstream() {
  const mcpPath = "/mcp";
  const transports = new Map();
  const app = express();
  app.use(express.json());

  app.post(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport;
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const mcp = new McpServer({ name: "upstream-e2e", version: "1.0.0" }, {});
        mcp.tool("e2e_bridge_ping", "ping", () => "pong");
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
          enableJsonResponse: true,
        });
        transport.onclose = () => {
          const sid = transport?.sessionId;
          if (sid) transports.delete(sid);
        };
        await mcp.connect(transport);
      } else {
        jsonRpcError(res, "Bad Request: missing session or initialize.");
        return;
      }
      if (!transport) {
        jsonRpcError(res, "Bad Request: transport.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  });

  app.get(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req, res) => {
    const sid = req.header("mcp-session-id");
    if (!sid) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const st = transports.get(sid);
    if (!st) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await st.handleRequest(req, res);
  });

  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr && "port" in addr ? addr.port : 0;
  const baseUrl = `http://127.0.0.1:${port}${mcpPath}`;
  return {
    baseUrl,
    close: async () => {
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    },
  };
}

async function main() {
  process.env.CLAWQL_BRIDGE_DIRECT_SHIM = "1";
  process.env.CLAWQL_BRIDGE_STREAMABLE_HTTP_JSON_RESPONSE = "1";

  const upstream = await startMinimalUpstream();
  const bridgeApp = await createPanguardBridgeApp({
    upstreamUrl: upstream.baseUrl,
    shimPath,
  });
  const bridgeServer = createServer(bridgeApp);
  await new Promise((resolve, reject) => {
    bridgeServer.listen(0, "127.0.0.1", () => resolve());
    bridgeServer.on("error", reject);
  });
  const bAddr = bridgeServer.address();
  const bPort = typeof bAddr === "object" && bAddr && "port" in bAddr ? bAddr.port : 0;
  const bridgeMcpUrl = new URL(`http://127.0.0.1:${bPort}/mcp`);

  const transport = new StreamableHTTPClientTransport(bridgeMcpUrl);
  const client = new Client({ name: "e2e-direct-shim", version: "1.0.0" }, {});
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    if (!names.includes("e2e_bridge_ping")) {
      console.error("[e2e-direct-shim] expected tool e2e_bridge_ping, got:", names);
      process.exitCode = 1;
      return;
    }
    console.error("[e2e-direct-shim] ok:", names.join(", "));
  } finally {
    await Promise.race([
      client.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
    if (typeof bridgeServer.closeAllConnections === "function") {
      bridgeServer.closeAllConnections();
    }
    await new Promise((resolve, reject) => bridgeServer.close((e) => (e ? reject(e) : resolve())));
    await upstream.close();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-direct-shim] fatal:", err);
  process.exit(1);
});
