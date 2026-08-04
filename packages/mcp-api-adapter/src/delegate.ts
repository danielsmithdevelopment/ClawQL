/**
 * Forward MCP requests from a local {@link Server} to an upstream {@link Client},
 * or to an upstream gRPC MCP server via mcp-grpc-transport.
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
import {
  callToolServerStreamingGrpc,
  listToolsUnaryGrpc,
} from "mcp-grpc-transport";
import { collapseCallToolMessages } from "./call.js";

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

/** Delegate ListTools / CallTool to an upstream gRPC MCP server. */
export function wireGrpcDelegationHandlers(
  server: Server,
  options: { address: string; protocolVersion?: string }
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await listToolsUnaryGrpc({
      address: options.address,
      protocolVersion: options.protocolVersion,
    });
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        title: t.title,
        inputSchema: t.inputSchema,
        outputSchema: t.outputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const messages = await callToolServerStreamingGrpc({
      address: options.address,
      toolName: request.params.name,
      arguments: (request.params.arguments as Record<string, unknown> | undefined) ?? {},
      protocolVersion: options.protocolVersion,
    });
    const collapsed = collapseCallToolMessages(messages);
    const content =
      Array.isArray(collapsed.content) && collapsed.content.length > 0
        ? collapsed.content
        : collapsed.text
          ? [{ type: "text" as const, text: collapsed.text }]
          : [];
    return {
      content,
      ...(collapsed.structuredContent
        ? { structuredContent: collapsed.structuredContent }
        : {}),
      ...(collapsed.isError !== undefined ? { isError: collapsed.isError } : {}),
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
}
