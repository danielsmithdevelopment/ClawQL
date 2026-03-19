/**
 * server.ts — Cloud Run MCP Server
 *
 * Entry point. Boots the MCP server over stdio (standard for Claude Desktop,
 * Cursor, and any MCP-compatible agent framework).
 *
 * Architecture:
 *
 *   Agent
 *     └─▶ MCP Server (this file)
 *           ├─▶ search tool  ──▶ spec-search.ts (in-memory, zero latency)
 *           └─▶ execution tools  ──▶ graphql-client.ts
 *                                        └─▶ graphql-proxy (localhost:4000)
 *                                              └─▶ Cloud Run REST API
 *
 * Environment variables:
 *   GOOGLE_ACCESS_TOKEN   OAuth2 bearer token for Cloud Run API calls
 *   GRAPHQL_URL           Override GraphQL proxy URL (default: localhost:4000/graphql)
 *   GRAPHQL_PORT          Port for the GraphQL proxy (default: 4000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSpec } from "./spec-loader.js";
import { registerTools } from "./tools.js";

async function main() {
  // Pre-warm the spec cache on startup so the first search call is fast
  await loadSpec();

  const server = new McpServer({
    name: "cloudrun-mcp",
    version: "1.0.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[cloudrun-mcp] Server running on stdio. Ready for connections.");
}

main().catch((err) => {
  console.error("[cloudrun-mcp] Fatal error during startup:", err);
  process.exit(1);
});