import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

const DEFAULT_INFO: Implementation = {
  name: "clawql-mcp",
  version: "3.2.1",
};

/**
 * Single construction path for MCP servers (stdio, Streamable HTTP, gRPC) so tool registration stays identical.
 */
export function createRegisteredMcpServer(serverInfo: Implementation = DEFAULT_INFO): McpServer {
  const server = new McpServer(serverInfo);
  registerTools(server);
  return server;
}
