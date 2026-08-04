/**
 * Forward MCP requests from a local {@link Server} to an upstream {@link Client}.
 * Same pattern as Panguard / ClawQL MCP-as-source bridges.
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export function wireDelegationHandlers(server: Server, client: Client): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => client.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    client.callTool(request.params)
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      return await client.listResources();
    } catch {
      return { resources: [] };
    }
  });
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    client.readResource(request.params)
  );
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    try {
      return await client.listResourceTemplates();
    } catch {
      return { resourceTemplates: [] };
    }
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    try {
      return await client.listPrompts();
    } catch {
      return { prompts: [] };
    }
  });
  server.setRequestHandler(GetPromptRequestSchema, async (request) =>
    client.getPrompt(request.params)
  );
}
