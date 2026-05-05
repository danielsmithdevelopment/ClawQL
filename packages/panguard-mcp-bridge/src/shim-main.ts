#!/usr/bin/env node
/**
 * stdio MCP server → Streamable HTTP MCP client (remote ClawQL).
 * Spawned by `panguard-mcp-proxy` as its upstream command.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { wireDelegationHandlers } from "./delegate-handlers.js";

function upstreamUrlFromEnv(): string {
  const raw = process.env.CLAWQL_BRIDGE_UPSTREAM_URL?.trim();
  if (raw) {
    return raw;
  }
  const host = process.env.CLAWQL_BRIDGE_UPSTREAM_HOST?.trim() || "127.0.0.1";
  const port = process.env.CLAWQL_BRIDGE_UPSTREAM_PORT?.trim() || "8080";
  const path = process.env.CLAWQL_BRIDGE_UPSTREAM_MCP_PATH?.trim() || "/mcp";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `http://${host}:${port}${p}`;
}

async function main(): Promise<void> {
  const url = upstreamUrlFromEnv();
  const httpTransport = new StreamableHTTPClientTransport(new URL(url));
  const httpClient = new Client({ name: "clawql-panguard-bridge-shim", version: "0.1.0" }, {});
  await httpClient.connect(httpTransport);

  const server = new Server(
    { name: "clawql-panguard-bridge-shim", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );
  wireDelegationHandlers(server, httpClient);

  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[clawql-panguard-bridge-shim] fatal: ${msg}\n`);
  process.exit(1);
});
