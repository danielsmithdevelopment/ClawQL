import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureClawqlApi } from "../composition/clawql-api-adapters.js";
import { assertNonnegotiableMcpToolsRegistered } from "./mcp-nonnegotiable-tools.js";
import { NPM_PACKAGE_VERSION } from "../host/npm-version.js";
import { registerTools, wireOptionalToolDeps } from "./tools.js";

const DEFAULT_INFO: Implementation = {
  name: "clawql-mcp",
  version: NPM_PACKAGE_VERSION,
};

/**
 * Sync construction — Core tools only unless {@link wireOptionalToolDeps} already ran.
 * Prefer {@link createRegisteredMcpServerAsync} for production (loads optional packages lazily).
 */
export function createRegisteredMcpServer(serverInfo: Implementation = DEFAULT_INFO): McpServer {
  const server = new McpServer(serverInfo);
  registerTools(server);
  assertNonnegotiableMcpToolsRegistered(server);
  return server;
}

/** Production path — dynamic plugin composition + lazy optional tool packages (§11.1). */
export async function createRegisteredMcpServerAsync(
  serverInfo: Implementation = DEFAULT_INFO
): Promise<McpServer> {
  await ensureClawqlApi();
  await wireOptionalToolDeps();
  return createRegisteredMcpServer(serverInfo);
}
