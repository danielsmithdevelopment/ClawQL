/**
 * Per-request MCP context (session id + optional ATR scope tokens).
 * HTTP / gRPC transports enter the ALS; tool wrappers read it for pre-execute.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type McpRequestContext = {
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
  /** Virtual-key / OIDC tenant — scopes events and durable stores when set. */
  readonly tenantId?: string;
};

const mcpRequestAls = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(ctx: McpRequestContext, fn: () => T): T {
  return mcpRequestAls.run(ctx, fn);
}

export function getMcpRequestContext(): McpRequestContext | undefined {
  return mcpRequestAls.getStore();
}

/**
 * Session key for IFC / pending / event isolation when a virtual-key tenant is present (S4).
 * Memory and durable caches are not yet partitioned by tenant — only in-process session state.
 */
export function tenantScopedSessionId(ctx: McpRequestContext | undefined): string | undefined {
  const sessionId = ctx?.sessionId?.trim();
  if (!sessionId) return undefined;
  const tenantId = ctx?.tenantId?.trim();
  return tenantId ? `${tenantId}::${sessionId}` : sessionId;
}
