/** MCP JSON-RPC payment error mode (vs tool-result `_meta` enrichment). */

export function isMppMcpJsonRpcEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.CLAWQL_MPP_MCP_JSONRPC?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
