#!/usr/bin/env node
/**
 * Fat equal-arm catalog MCP — many tools, verbose schemas, fat default results.
 * Used so aggregator gateways expose a large tools/list surface while ClawQL
 * stays on search+execute against a mirrored OpenAPI catalog.
 *
 * Transports:
 *   (default) stdio — MCPJungle / agentgateway / Bifrost
 *   --http --port N — Streamable HTTP at http://127.0.0.1:N/mcp (Obot remote peer)
 *
 * Env:
 *   CATALOG_TOOL_COUNT (default 40)
 *   EQUAL_ARM_UPSTREAM (optional) — unused; results are synthetic
 */
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const N = Math.max(4, Math.min(200, Number(process.env.CATALOG_TOOL_COUNT ?? 40) || 40));

function fatRow(i) {
  return {
    id: i,
    name: `Entity-${i}`,
    status: i % 3 === 0 ? "sold" : "available",
    tag: `tag-${i % 10}`,
    meta: {
      kennel: `K${i % 5}`,
      notes: "x".repeat(80),
      history: Array.from({ length: 5 }, (_, j) => ({ at: j, event: `e-${j}` })),
    },
  };
}

function makeTools() {
  const tools = [];
  for (let i = 1; i <= N; i++) {
    const name = `catalog_list_${String(i).padStart(3, "0")}`;
    tools.push({
      name,
      description:
        `List entities from catalog partition ${i}. Returns a verbose JSON array with nested meta/history. ` +
        `Use when the agent needs partition ${i} inventory. Prefer filtering client-side if the gateway cannot project fields. ` +
        `Partition theme: ${["pets", "orders", "users", "tickets", "assets"][i % 5]}.`,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Max rows to return (default 25, max 100).",
            minimum: 1,
            maximum: 100,
          },
          status: {
            type: "string",
            enum: ["available", "sold", "any"],
            description: "Optional status filter.",
          },
          includeMeta: {
            type: "boolean",
            description: "Include nested meta/history (default true).",
          },
        },
        additionalProperties: false,
      },
    });
  }
  return tools;
}

const TOOLS = makeTools();

function makeServer() {
  const server = new Server({ name: "equal-arm-catalog", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      return { isError: true, content: [{ type: "text", text: `unknown tool ${req.params.name}` }] };
    }
    const args = req.params.arguments || {};
    const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25) || 25));
    const status = args.status ?? "any";
    const includeMeta = args.includeMeta !== false;
    const rows = [];
    for (let i = 1; rows.length < limit; i++) {
      const row = fatRow(i + TOOLS.indexOf(tool) * 1000);
      if (status !== "any" && row.status !== status) continue;
      if (!includeMeta) {
        rows.push({ id: row.id, name: row.name, status: row.status });
      } else {
        rows.push(row);
      }
    }
    return { content: [{ type: "text", text: JSON.stringify({ items: rows, partition: tool.name }) }] };
  });
  return server;
}

async function runStdio() {
  const server = makeServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp(port) {
  // Stateless per-request transports so Obot health-check sessions and the
  // multiturn harness client can both talk to the same catalog process.
  const http = createServer(async (req, res) => {
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
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
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      void transport.close();
      void server.close();
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    }
  });
  await new Promise((resolve) => http.listen(port, "0.0.0.0", resolve));
  const addr = http.address();
  process.stderr.write(
    `[equal-arm-catalog] streamable http ready http://127.0.0.1:${addr.port}/mcp tools=${N}\n`
  );
}

const args = process.argv.slice(2);
const httpIdx = args.indexOf("--http");
if (httpIdx >= 0) {
  const pIdx = args.indexOf("--port");
  const port = pIdx >= 0 ? Number(args[pIdx + 1]) || 0 : 18770;
  await runHttp(port);
} else {
  await runStdio();
}
