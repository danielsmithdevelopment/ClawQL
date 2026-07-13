/** Whether structural code graph MCP tools are registered (opt-in). */
export function codeGraphEnabled(): boolean {
  const v = process.env.CLAWQL_ENABLE_CODEGRAPH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function defaultCodeGraphRoot(): string {
  const v = process.env.CLAWQL_CODEGRAPH_ROOT?.trim();
  return v || process.cwd();
}
