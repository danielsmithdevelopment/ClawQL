/**
 * server.ts — ClawQL MCP Server
 *
 * Entry point. Boots the MCP server over stdio (Claude Desktop, Cursor, etc.).
 *
 *   Agent → MCP (this file) → search / execute / optional sandbox_exec / memory_* → in-process GraphQL (single-spec) → REST API
 *
 * Spec source: CLAWQL_SPEC_PATH, CLAWQL_SPEC_URL, CLAWQL_DISCOVERY_URL, or default
 * Cloud Run discovery. See README and .env.example.
 *
 * **Startup order:** connect the MCP transport **before** warming the OpenAPI/GraphQL
 * spec cache. Cursor and similar clients fail tool discovery if stdio stays silent
 * for several seconds while the default six-vendor stack loads (~5–10s). `search` /
 * `execute` still `await loadSpec()` on first use; memory tools do not need specs.
 */

import "./load-env.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NPM_PACKAGE_VERSION } from "./npm-version.js";
import { loadSpec, registerSpecCacheShutdownHooks } from "clawql-api";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { preloadSchemaFieldCacheFromDisk } from "./tools.js";
import { validateOrDegradeObsidianVaultAtStartup } from "./vault-config.js";
import { registerPostgresPoolShutdownHooks } from "clawql-memory/vector/pgvector";
import { registerClawqlApiShutdownHooks } from "./clawql-api-adapters.js";
import { maybeInitOtelTracing } from "./otel-tracing.js";
import { ensureProcessWormHostBooted } from "./process-worm-host.js";
import { maybeVerifyReleaseManifestAtStartup } from "./release-manifest-startup.js";

/** Warm specs after Ready; failures are logged and do not kill the process. */
async function warmSpecCacheInBackground(): Promise<void> {
  try {
    await loadSpec();
    const { logStartupSummary } = await import("./startup-summary.js");
    await logStartupSummary();
    // Prefer pregenerated introspection.json (bundled or CLAWQL_INTROSPECTION_PATH) over live proxy introspection
    await preloadSchemaFieldCacheFromDisk();
  } catch (err: unknown) {
    console.error("[cloudrun-mcp] Background spec warm failed:", err);
  }
}

async function main() {
  await maybeInitOtelTracing();
  await maybeVerifyReleaseManifestAtStartup();
  registerSpecCacheShutdownHooks();
  registerPostgresPoolShutdownHooks();
  registerClawqlApiShutdownHooks();
  await ensureProcessWormHostBooted();
  await validateOrDegradeObsidianVaultAtStartup();

  const server = createRegisteredMcpServer({
    name: "cloudrun-mcp",
    version: NPM_PACKAGE_VERSION,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[cloudrun-mcp] Server running on stdio. Ready for connections.");

  // Do not await — keep initialize / tools/list off the critical path for IDE discovery.
  void warmSpecCacheInBackground();
}

main().catch((err) => {
  console.error("[cloudrun-mcp] Fatal error during startup:", err);
  process.exit(1);
});
