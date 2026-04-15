/**
 * server.ts — ClawQL MCP Server
 *
 * Entry point. Boots the MCP server over stdio (Claude Desktop, Cursor, etc.).
 *
 *   Agent → MCP (this file) → search / execute / code / memory_* → graphql-client → graphql-proxy → REST API
 *
 * Spec source: CLAWQL_SPEC_PATH, CLAWQL_SPEC_URL, CLAWQL_DISCOVERY_URL, or default
 * Cloud Run discovery. See README and .env.example.
 *
 *   GRAPHQL_URL     GraphQL proxy URL (default http://localhost:4000/graphql)
 *   GRAPHQL_PORT    Only if you spawn the proxy yourself (default 4000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSpec } from "./spec-loader.js";
import { preloadSchemaFieldCacheFromDisk, registerTools } from "./tools.js";
import { validateObsidianVaultAtStartup } from "./vault-config.js";

async function main() {
  // Pre-warm the spec cache on startup so the first search call is fast
  await loadSpec();
  // Prefer pregenerated introspection.json (bundled or CLAWQL_INTROSPECTION_PATH) over live proxy introspection
  await preloadSchemaFieldCacheFromDisk();
  await validateObsidianVaultAtStartup();

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