/**
 * Whether pageindex_* MCP tools are registered.
 * 8.0.0+: default **off** — set CLAWQL_ENABLE_PAGEINDEX=1 to enable (prove-or-purge).
 */
export function pageIndexEnabled(): boolean {
  const v = process.env.CLAWQL_ENABLE_PAGEINDEX?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
