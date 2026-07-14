/** Whether pageindex_* MCP tools are registered (default on; set CLAWQL_ENABLE_PAGEINDEX=0 to hide). */
export function pageIndexEnabled(): boolean {
  return process.env.CLAWQL_ENABLE_PAGEINDEX?.trim() !== "0";
}
