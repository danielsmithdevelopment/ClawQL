/**
 * Per-request MCP context (session id, ATR scope, tenant, subject).
 * HTTP / gRPC transports enter the ALS; tools and plugins read it.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type McpRequestContext = {
  readonly sessionId?: string;
  readonly atrScopeTokens?: readonly string[];
  /** Virtual-key / OIDC tenant — scopes events and durable stores when set. */
  readonly tenantId?: string;
  /** Verified subject from claims (`sub`). */
  readonly sub?: string;
  /** Optional agent id when distinct from `sub`. */
  readonly agentId?: string;
  /** Scope list from claims (gRPC auth context). */
  readonly scope?: readonly string[];
};

const mcpRequestAls = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(ctx: McpRequestContext, fn: () => T): T {
  return mcpRequestAls.run(ctx, fn);
}

export function getMcpRequestContext(): McpRequestContext | undefined {
  return mcpRequestAls.getStore();
}

/**
 * Session key for IFC / pending / event isolation when a virtual-key tenant is present.
 */
export function tenantScopedSessionId(ctx: McpRequestContext | undefined): string | undefined {
  const sessionId = ctx?.sessionId?.trim();
  if (!sessionId) return undefined;
  const tenantId = ctx?.tenantId?.trim();
  return tenantId ? `${tenantId}::${sessionId}` : sessionId;
}
