import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * MCP tools that must always be registered and enabled for every transport
 * (stdio, Streamable HTTP, gRPC). Used at server construction and in release gates.
 *
 * Keep in sync with {@link registerTools} in tools.ts (cache + audit immediately after search/execute).
 */
export const CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES = ["search", "execute", "cache", "audit"] as const;
export type ClawqlNonnegotiableMcpToolName = (typeof CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES)[number];

type ToolRegistry = Record<string, { enabled?: boolean } | undefined>;

/**
 * Runtime guard: {@link McpServer} keeps registered tools in `_registeredTools` (SDK implementation detail).
 * If the SDK renames this, this function fails closed so we notice immediately.
 */
export function assertNonnegotiableMcpToolsRegistered(server: McpServer): void {
  const registry = (server as unknown as { _registeredTools?: ToolRegistry })._registeredTools;
  if (!registry || typeof registry !== "object") {
    throw new Error(
      "ClawQL invariant: McpServer has no _registeredTools map — MCP SDK may have changed; cannot verify audit/cache."
    );
  }
  const missing: string[] = [];
  const disabled: string[] = [];
  for (const name of CLAWQL_NONNEGOTIABLE_MCP_TOOL_NAMES) {
    const entry = registry[name];
    if (!entry) missing.push(name);
    else if (entry.enabled === false) disabled.push(name);
  }
  if (missing.length > 0 || disabled.length > 0) {
    throw new Error(
      "ClawQL invariant violated: non-negotiable MCP tools must always be registered and enabled. " +
        `missing=[${missing.join(", ")}] disabled=[${disabled.join(", ")}]`
    );
  }
}
