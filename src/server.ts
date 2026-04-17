/**
 * server.ts — ClawQL MCP Server
 *
 * Entry point. Boots the MCP server over stdio (Claude Desktop, Cursor, etc.).
 *
 *   Agent → MCP (this file) → search / execute / sandbox_exec / memory_* → in-process GraphQL (single-spec) → REST API
 *
 * Spec source: CLAWQL_SPEC_PATH, CLAWQL_SPEC_URL, CLAWQL_DISCOVERY_URL, or default
 * Cloud Run discovery. See README and .env.example.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadSpec } from "./spec-loader.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { preloadSchemaFieldCacheFromDisk } from "./tools.js";
import { validateObsidianVaultAtStartup } from "./vault-config.js";
import { registerPostgresPoolShutdownHooks } from "./vector-store/pgvector.js";

async function main() {
  registerPostgresPoolShutdownHooks();
  // Pre-warm the spec cache on startup so the first search call is fast
  await loadSpec();
  // Prefer pregenerated introspection.json (bundled or CLAWQL_INTROSPECTION_PATH) over live proxy introspection
  await preloadSchemaFieldCacheFromDisk();
  await validateObsidianVaultAtStartup();

  const server = createRegisteredMcpServer({
    name: "cloudrun-mcp",
    version: "2.0.0",
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[cloudrun-mcp] Server running on stdio. Ready for connections.");
}

main().catch((err) => {
  console.error("[cloudrun-mcp] Fatal error during startup:", err);
  process.exit(1);
});
