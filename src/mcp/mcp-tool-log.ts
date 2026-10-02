/**
 * Optional operator observability for MCP memory tools (GitHub #28).
 * Set CLAWQL_MCP_LOG_TOOLS=1 to log tool name + parameter shape (lengths and
 * booleans only — no query text, titles, conversation bodies, or API keys).
 */
export function logMcpToolShape(tool: string, shape: Record<string, unknown>): void {
  if (process.env.CLAWQL_MCP_LOG_TOOLS?.trim() !== "1") return;
  console.error(`[clawql-mcp] tool ${tool} ${JSON.stringify(shape)}`);
}
