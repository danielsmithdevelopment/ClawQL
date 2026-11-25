/**
 * Re-export host MCP request ALS from clawql-core so packages (e.g. payments)
 * share the same store as the HTTP/gRPC gateway.
 */
export {
  getMcpRequestContext,
  runWithMcpRequestContext,
  tenantScopedSessionId,
  type McpRequestContext,
} from "clawql-core";
