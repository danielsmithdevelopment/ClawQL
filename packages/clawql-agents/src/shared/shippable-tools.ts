/**
 * Shippable ClawQL MCP tool names for ATR templates (tools/list today).
 * Family S OpenBench stubs (email_send, …) stay out of v0 shippable templates.
 */
export const SHIPPABLE_MCP_TOOLS = [
  "search",
  "execute",
  "audit",
  "cache",
  "memory_recall",
  "memory_ingest",
  "data_query",
  "clawql_sql",
  "web_search",
  "sandbox_exec",
  "schedule",
  "notify",
] as const;

export type ShippableMcpTool = (typeof SHIPPABLE_MCP_TOOLS)[number];

/** Core always-on tools. */
export const CORE_MCP_TOOLS = ["search", "execute", "audit", "cache"] as const;

/** Default memory + discovery set used by personal-agent Hermes/Cline scopes. */
export const DEFAULT_MEMORY_TOOLS = [
  "memory_recall",
  "memory_ingest",
  "search",
  "execute",
  "audit",
] as const;
