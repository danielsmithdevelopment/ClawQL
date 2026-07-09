/**
 * Registry for proxied MCP tool sources (cleared with spec cache).
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type McpSourceBinding = {
  sourceId: string;
  toolName: string;
  client: Client;
};

const bindings = new Map<string, McpSourceBinding>();

export function mcpBindingKey(sourceId: string, toolName: string): string {
  return `${sourceId}::${toolName}`;
}

export function registerMcpToolBinding(binding: McpSourceBinding): void {
  bindings.set(mcpBindingKey(binding.sourceId, binding.toolName), binding);
}

export function getMcpToolBinding(
  sourceId: string,
  toolName: string
): McpSourceBinding | undefined {
  return bindings.get(mcpBindingKey(sourceId, toolName));
}

export function resetMcpSourceRegistry(): void {
  for (const b of bindings.values()) {
    try {
      void b.client.close();
    } catch {
      /* noop */
    }
  }
  bindings.clear();
}
