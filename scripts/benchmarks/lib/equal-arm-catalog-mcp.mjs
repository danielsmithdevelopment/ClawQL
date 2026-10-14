#!/usr/bin/env node
/**
 * Fat equal-arm catalog MCP — many tools, verbose schemas, fat default results.
 * Used so aggregator gateways expose a large tools/list surface while ClawQL
 * stays on search+execute against a mirrored OpenAPI catalog.
 *
 * Env:
 *   CATALOG_TOOL_COUNT (default 40)
 *   MT_UPSTREAM_LATENCY_MS — fixed ms or "min-max" (same as HTTP mock; peer equal-arm)
 *   EQUAL_ARM_UPSTREAM (optional) — unused; results are synthetic
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const N = Math.max(4, Math.min(250, Number(process.env.CATALOG_TOOL_COUNT ?? 40) || 40));

function parseLatencyMs() {
  const raw = (process.env.MT_UPSTREAM_LATENCY_MS ?? "").trim();
  if (!raw) return { kind: "none" };
  const range = raw.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min && min >= 0) {
      return { kind: "range", min, max };
    }
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return { kind: "fixed", ms: n };
  return { kind: "none" };
}

const LATENCY = parseLatencyMs();

function latencySampleMs() {
  if (LATENCY.kind === "fixed") return LATENCY.ms;
  if (LATENCY.kind === "range") {
    return LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min);
  }
  return 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    const injectMs = latencySampleMs();
    if (injectMs > 0) await sleep(injectMs);
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

const server = makeServer();
await server.connect(new StdioServerTransport());
