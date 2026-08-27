/**
 * Execute proxied WebMCP tool calls for user-added WebMCP page sources.
 */

import { Effect } from "effect";
import type { Operation } from "../spec/operation-types.js";
import { getWebmcpSourceBinding } from "../spec/webmcp-source-registry.js";
import { executeWebmcpToolEffect } from "../webmcp/webmcp-browser.js";
import type { ExecuteOperationResult } from "./types.js";

function parseToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const raw = args.arguments ?? args;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function executeNativeWebmcpEffect(
  op: Operation,
  args: Record<string, unknown>
): Effect.Effect<ExecuteOperationResult, never> {
  return Effect.gen(function* () {
    const meta = op.nativeWebmcp;
    if (!meta) {
      return { ok: false as const, error: "Internal error: missing nativeWebmcp metadata" };
    }

    const binding = getWebmcpSourceBinding(meta.sourceId);
    if (!binding) {
      return {
        ok: false as const,
        error: `WebMCP source not connected: ${meta.sourceId} (restart MCP after adding sources)`,
      };
    }

    const toolArgs = parseToolArgs(args);
    const result = yield* executeWebmcpToolEffect(binding.session, meta.toolName, toolArgs).pipe(
      Effect.match({
        onFailure: (e) => ({ ok: false as const, error: e.message }),
        onSuccess: (data) => ({ ok: true as const, data }),
      })
    );
    return result;
  });
}

/** Thin Promise façade for execute-core host boundary. */
export async function executeNativeWebmcp(
  op: Operation,
  args: Record<string, unknown>
): Promise<ExecuteOperationResult> {
  return Effect.runPromise(executeNativeWebmcpEffect(op, args));
}
