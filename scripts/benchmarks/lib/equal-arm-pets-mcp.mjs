#!/usr/bin/env node
/**
 * Minimal equal-arm MCP upstream for gateway multi-comparison.
 *
 * Transports:
 *   --stdio (default) — spawn as child of MCPJungle / agentgateway / ContextForge translate
 *   --http --port N   — Streamable HTTP at http://127.0.0.1:N/mcp
 *
 * Tool: list_pets → same pets JSON as executor-comparison EQUAL_PAYLOAD (no network I/O).
 */
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

const EQUAL_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};

const TOOL = {
  name: "list_pets",
  description: "Return the equal-arm pets JSON fixture (two available pets).",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

function makeServer() {
  const server = new Server({ name: "equal-arm-pets", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "list_pets") {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool ${req.params.name}` }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(EQUAL_PAYLOAD) }],
    };
  });
  return server;
}

async function runStdio() {
  const server = makeServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp(port) {
  const server = makeServer();
  // Stateless mode — gateway proxies (ContextForge) re-initialize without sticky sessions.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const http = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      let parsedBody;
      if (raw.length) {
        try {
          parsedBody = JSON.parse(raw.toString("utf8"));
        } catch {
          parsedBody = undefined;
        }
      }
      await transport.handleRequest(req, res, parsedBody);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    }
  });
  await new Promise((resolve) => http.listen(port, "127.0.0.1", resolve));
  const addr = http.address();
  process.stderr.write(`[equal-arm-pets] streamable http ready http://127.0.0.1:${addr.port}/mcp\n`);
}

const args = process.argv.slice(2);
const httpIdx = args.indexOf("--http");
if (httpIdx >= 0) {
  const pIdx = args.indexOf("--port");
  const port = pIdx >= 0 ? Number(args[pIdx + 1]) || 0 : 0;
  await runHttp(port);
} else {
  await runStdio();
}
