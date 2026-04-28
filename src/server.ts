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

import "./load-env.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NPM_PACKAGE_VERSION } from "./npm-version.js";
import { loadSpec, registerSpecCacheShutdownHooks } from "./spec-loader.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { preloadSchemaFieldCacheFromDisk } from "./tools.js";
import { validateObsidianVaultAtStartup } from "./vault-config.js";
import { registerOuroborosPoolShutdownHooks } from "./ouroboros/postgres-pool.js";
import { registerPostgresPoolShutdownHooks } from "./vector-store/pgvector.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { registerScheduleWorkerShutdownHooks, startScheduleWorker } from "./clawql-schedule.js";

async function main() {
  registerSpecCacheShutdownHooks();
  registerPostgresPoolShutdownHooks();
  registerOuroborosPoolShutdownHooks();
  // Pre-warm the spec cache on startup so the first search call is fast
  await loadSpec();
  // Prefer pregenerated introspection.json (bundled or CLAWQL_INTROSPECTION_PATH) over live proxy introspection
  await preloadSchemaFieldCacheFromDisk();
  await validateObsidianVaultAtStartup();
  if (getClawqlOptionalToolFlags().enableSchedule) {
    registerScheduleWorkerShutdownHooks();
    startScheduleWorker();
  }

  const server = createRegisteredMcpServer({
    name: "cloudrun-mcp",
    version: NPM_PACKAGE_VERSION,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[cloudrun-mcp] Server running on stdio. Ready for connections.");
}

main().catch((err) => {
  console.error("[cloudrun-mcp] Fatal error during startup:", err);
  process.exit(1);
});
