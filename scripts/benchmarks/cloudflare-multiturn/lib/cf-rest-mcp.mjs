#!/usr/bin/env node
/**
 * Curated Cloudflare REST → MCP stdio adapter for MCPJungle / agentgateway.
 *
 * Env:
 *   CF_MOCK_BASE — http://127.0.0.1:PORT (replay mock; no /client/v4 prefix)
 *   CF_CURATED_OPENAPI — path to curated-openapi.json
 *   CF_ACCOUNT_ID / CF_ZONE_ID — defaults for path templates when args omit them
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { FAKE } from "./fixture-ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENAPI =
  process.env.CF_CURATED_OPENAPI || join(HERE, "../fixtures/curated-openapi.json");
const MOCK = (process.env.CF_MOCK_BASE || "http://127.0.0.1:9").replace(/\/$/, "");
const ACCOUNT = process.env.CF_ACCOUNT_ID || FAKE.accountId;
const ZONE = process.env.CF_ZONE_ID || FAKE.auditZoneId;

const spec = JSON.parse(readFileSync(OPENAPI, "utf8"));
const tools = [];
const byName = new Map();

for (const [path, methods] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(methods || {})) {
    if (!op?.operationId) continue;
    const name = op.operationId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const props = {};
    const required = [];
    for (const p of op.parameters || []) {
      if (!p?.name) continue;
      props[p.name] = p.schema || { type: "string" };
      if (p.description) props[p.name].description = p.description;
      if (p.required) required.push(p.name);
    }
    // Path params often only in path template
    for (const m of path.matchAll(/\{([^}]+)\}/g)) {
      if (!props[m[1]]) props[m[1]] = { type: "string" };
      if (!required.includes(m[1])) required.push(m[1]);
    }
    const tool = {
      name,
      description: (op.summary || op.description || name).slice(0, 500),
      inputSchema: {
        type: "object",
        properties: props,
        ...(required.length ? { required } : {}),
      },
      _meta: { method: method.toUpperCase(), path, operationId: op.operationId },
    };
    tools.push(tool);
    byName.set(name, tool);
  }
}

function fillPath(template, args) {
  const defaults = {
    account_id: ACCOUNT,
    zone_id: ZONE,
    zone_identifier: ZONE,
    account_identifier: ACCOUNT,
    setting_id: "ssl",
    script_name: FAKE.workerScriptName,
    dns_record_id: FAKE.unproxiedRecordId,
  };
  return template.replace(/\{([^}]+)\}/g, (_, key) => {
    const v = args[key] ?? defaults[key];
    if (v == null) throw new Error(`missing path param ${key}`);
    return encodeURIComponent(String(v));
  });
}

function makeServer() {
  const server = new Server({ name: "cf-rest-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ _meta, ...t }) => t),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) throw new Error(`unknown tool ${req.params.name}`);
    const args = req.params.arguments || {};
    const path = fillPath(tool._meta.path, args);
    const url = new URL(MOCK + path);
    for (const [k, v] of Object.entries(args)) {
      if (path.includes(`/${encodeURIComponent(String(v))}`)) continue;
      if (["account_id", "zone_id", "setting_id", "script_name", "dns_record_id"].includes(k)) continue;
      if (v != null) url.searchParams.set(k, String(v));
    }
    // DNS list needs per_page for fat response
    if (tool._meta.path.includes("dns_records") && !url.searchParams.has("per_page")) {
      url.searchParams.set("per_page", "500");
    }
    if (tool._meta.method !== "GET" && tool._meta.method !== "HEAD") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              errors: [{ message: "benchmark adapter refuses non-GET; use gated proposal" }],
            }),
          },
        ],
      };
    }
    const res = await fetch(url, { method: tool._meta.method });
    const text = await res.text();
    return { content: [{ type: "text", text }] };
  });
  return server;
}

const server = makeServer();
await server.connect(new StdioServerTransport());
