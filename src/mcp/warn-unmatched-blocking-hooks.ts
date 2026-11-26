/**
 * Startup warning when a blocking tool-scoped hook's pattern matches no
 * registered MCP tool (audit follow-up after 2.15 full-name anchoring).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { unmatchedBlockingToolHooks } from "clawql-core";
import { getClawqlApi } from "../composition/clawql-api-adapters.js";

type ToolRegistry = Record<string, unknown>;

function registeredToolNames(server: McpServer): string[] {
  const registry = (server as unknown as { _registeredTools?: ToolRegistry })._registeredTools;
  if (!registry || typeof registry !== "object") return [];
  return Object.keys(registry);
}

/**
 * Log a warning for each blocking tool hook that matches zero registered tools.
 * No-ops when the ClawQL API handle is not yet initialized (sync test helpers).
 */
export function warnUnmatchedBlockingHooks(server: McpServer): void {
  let hooks: Parameters<typeof unmatchedBlockingToolHooks>[0];
  try {
    hooks = Effect.runSync(getClawqlApi().hookRegistry.listAll());
  } catch {
    return;
  }

  const tools = registeredToolNames(server);
  const unmatched = unmatchedBlockingToolHooks(hooks, tools);
  for (const u of unmatched) {
    const where = u.pluginId ? `${u.pluginId}/${u.hookId}` : u.hookId;
    console.warn(
      `[clawql-mcp] SECURITY WARNING: blocking hook ${where} toolPattern=${JSON.stringify(
        u.toolPattern
      )} matches no registered MCP tool — the hook will never fire`
    );
  }
}
