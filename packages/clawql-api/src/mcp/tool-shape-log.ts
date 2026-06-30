/**
 * Optional operator observability for MCP tools (GitHub #28).
 * Set CLAWQL_MCP_LOG_TOOLS=1 to log tool name + parameter shape only.
 */
export function logMcpToolShape(tool: string, shape: Record<string, unknown>): void {
  if (process.env.CLAWQL_MCP_LOG_TOOLS?.trim() !== "1") return;
  process.stderr.write(`[clawql-mcp] tool ${tool} ${JSON.stringify(shape)}\n`);
}
