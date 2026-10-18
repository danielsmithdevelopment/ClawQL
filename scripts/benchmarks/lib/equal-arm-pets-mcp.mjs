#!/usr/bin/env node
/**
 * Minimal equal-arm MCP upstream for gateway multi-comparison.
 *
 * Transports:
 *   --stdio (default) — spawn as child of MCPJungle / agentgateway / ContextForge
 *   --http --port N   — Streamable HTTP at http://127.0.0.1:N/mcp
 *
 * Tool: list_pets
 *   - If EQUAL_ARM_UPSTREAM is set (e.g. http://127.0.0.1:PORT), GET {upstream}/pets
 *     so aggregator arms pay the same HTTP hop as ClawQL OpenAPI execute.
 *   - Otherwise return the static equal-arm pets JSON (upstream≈0).
 */
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

const STATIC_PAYLOAD = {
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
};

const UPSTREAM = (process.env.EQUAL_ARM_UPSTREAM || "").replace(/\/$/, "");

const TOOL = {
  name: "list_pets",
  description: UPSTREAM
    ? "Fetch equal-arm pets JSON from the shared mock HTTP upstream."
    : "Return the equal-arm pets JSON fixture (two available pets).",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

async function petsJson() {
  if (!UPSTREAM) return JSON.stringify(STATIC_PAYLOAD);
  const res = await fetch(`${UPSTREAM}/pets`);
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

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
    try {
      const text = await petsJson();
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: String(err?.message ?? err) }],
      };
    }
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
  // Stateful sessions — ContextForge initialize is happier with session IDs.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
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
  process.stderr.write(
    `[equal-arm-pets] streamable http ready http://127.0.0.1:${addr.port}/mcp upstream=${UPSTREAM || "static"}\n`
  );
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
