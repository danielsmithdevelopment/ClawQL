/**
 * Load MCP server tools as searchable/executable operations (MCP-as-source).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Operation } from "./operation-types.js";
import { normalizeOperationId } from "./spec-kind.js";
import type { CustomSourceEntry } from "./custom-sources-types.js";
import { registerMcpToolBinding } from "./mcp-source-registry.js";

async function connectMcpClient(entry: CustomSourceEntry): Promise<Client> {
  const client = new Client({ name: "clawql-mcp-source", version: "1.0.0" }, {});

  if (entry.mcpUrl?.trim()) {
    const transport = new StreamableHTTPClientTransport(new URL(entry.mcpUrl.trim()));
    await client.connect(transport);
    return client;
  }

  if (!entry.mcpCommand?.trim()) {
    throw new Error(`MCP source "${entry.id}" needs mcpUrl or mcpCommand`);
  }

  const transport = new StdioClientTransport({
    command: entry.mcpCommand.trim(),
    args: entry.mcpArgs ?? [],
    env: { ...process.env, ...(entry.mcpEnv ?? {}) } as Record<string, string>,
    stderr: "pipe",
  });
  await client.connect(transport);
  return client;
}

function toolToOperation(entry: CustomSourceEntry, toolName: string, description: string): Operation {
  const id = normalizeOperationId("mcp", entry.id, toolName);
  return {
    id,
    method: "MCP",
    path: `/mcp/${entry.id}/${toolName}`,
    flatPath: `mcp/${entry.id}/${toolName}`,
    description: description || `MCP tool ${toolName} from ${entry.name}`,
    resource: entry.id,
    parameters: {
      arguments: {
        type: "object",
        location: "query",
        required: false,
        description: "JSON object passed to the MCP tool call",
      },
    },
    scopes: [],
    specLabel: entry.id,
    protocolKind: "mcp",
    nativeMcp: {
      sourceId: entry.id,
      toolName,
    },
  };
}

export async function loadMcpSourceOperations(
  entries: CustomSourceEntry[]
): Promise<Operation[]> {
  const mcpEntries = entries.filter((e) => e.kind === "mcp");
  const ops: Operation[] = [];

  for (const entry of mcpEntries) {
    try {
      const client = await connectMcpClient(entry);
      const { tools } = await client.listTools();
      for (const tool of tools) {
        registerMcpToolBinding({
          sourceId: entry.id,
          toolName: tool.name,
          client,
        });
        ops.push(toolToOperation(entry, tool.name, tool.description ?? ""));
      }
      console.error(
        `[spec-loader] MCP source "${entry.id}": ${tools.length} tool(s) from ${entry.mcpUrl ?? entry.mcpCommand}`
      );
    } catch (e: unknown) {
      console.error(
        `[spec-loader] MCP source "${entry.id}" failed:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return ops;
}
