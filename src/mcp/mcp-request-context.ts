/**
 * Per-request MCP context (session id + optional ATR scope tokens).
 * HTTP / gRPC transports enter the ALS; tool wrappers read it for pre-execute.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type McpRequestContext = {
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
};

const mcpRequestAls = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(ctx: McpRequestContext, fn: () => T): T {
  return mcpRequestAls.run(ctx, fn);
}

export function getMcpRequestContext(): McpRequestContext | undefined {
  return mcpRequestAls.getStore();
}
