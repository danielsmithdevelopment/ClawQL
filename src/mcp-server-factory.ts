import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ensureClawqlApi } from "./clawql-api-adapters.js";
import { assertNonnegotiableMcpToolsRegistered } from "./mcp-nonnegotiable-tools.js";
import { NPM_PACKAGE_VERSION } from "./npm-version.js";
import { registerTools } from "./tools.js";

const DEFAULT_INFO: Implementation = {
  name: "clawql-mcp",
  version: NPM_PACKAGE_VERSION,
};

/**
 * Single construction path for MCP servers (stdio, Streamable HTTP, gRPC) so tool registration stays identical.
 */
export function createRegisteredMcpServer(serverInfo: Implementation = DEFAULT_INFO): McpServer {
  const server = new McpServer(serverInfo);
  registerTools(server);
  assertNonnegotiableMcpToolsRegistered(server);
  return server;
}

/** Production path — dynamic plugin composition via {@link ensureClawqlApi}. */
export async function createRegisteredMcpServerAsync(
  serverInfo: Implementation = DEFAULT_INFO
): Promise<McpServer> {
  await ensureClawqlApi();
  return createRegisteredMcpServer(serverInfo);
}
