/**
 * Forward MCP requests from a {@link Server} to an upstream {@link Client}
 * (same pattern as `@panguard-ai/panguard-mcp-proxy` → upstream).
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export function wireDelegationHandlers(server: Server, client: Client): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => client.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    client.callTool(request.params)
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => client.listResources());
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    client.readResource(request.params)
  );
  server.setRequestHandler(ListPromptsRequestSchema, async () => client.listPrompts());
  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    client.getPrompt(request.params)
  );
}
