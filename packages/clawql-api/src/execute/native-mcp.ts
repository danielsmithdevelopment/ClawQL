/**
 * Execute proxied MCP tool calls for user-added MCP sources.
 */

import type { Operation } from "../spec/operation-types.js";
import { getMcpToolBinding } from "../spec/mcp-source-registry.js";
import type { ExecuteOperationResult } from "./types.js";

export async function executeNativeMcp(
  op: Operation,
  args: Record<string, unknown>
): Promise<ExecuteOperationResult> {
  const meta = op.nativeMcp;
  if (!meta) {
    return { ok: false, error: "Internal error: missing nativeMcp metadata" };
  }

  const binding = getMcpToolBinding(meta.sourceId, meta.toolName);
  if (!binding) {
    return {
      ok: false,
      error: `MCP source not connected: ${meta.sourceId} (restart MCP after adding sources)`,
    };
  }

  let toolArgs: Record<string, unknown> = {};
  const raw = args.arguments ?? args;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    toolArgs = raw as Record<string, unknown>;
  }

  try {
    const result = await binding.client.callTool({
      name: meta.toolName,
      arguments: toolArgs,
    });
    return { ok: true, data: result };
  } catch (e: unknown) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
