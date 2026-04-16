/**
 * Combined (in-process) GraphQL vs split HTTP proxy (`GRAPHQL_URL`).
 *
 * Set `CLAWQL_COMBINED_MODE=1` so `execute` and schema introspection run in-process
 * (see `graphql-in-process-execute.ts`). Optional HTTP `/graphql` is mounted on
 * `clawql-mcp-http` for debugging.
 *
 * If `CLAWQL_GRAPHQL_EXTERNAL_URL` is set, the MCP server always uses that HTTP
 * endpoint (split mode), even when `CLAWQL_COMBINED_MODE` is set.
 */

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Epic #34: opt-in unified process — in-process GraphQL execution. */
export function isCombinedGraphQLMode(): boolean {
  return truthyEnv("CLAWQL_COMBINED_MODE");
}

/**
 * Use in-process GraphQL for MCP `execute` and live introspection (when no disk cache).
 * Split when an explicit external GraphQL HTTP URL is configured.
 */
export function useInProcessGraphQL(): boolean {
  if (process.env.CLAWQL_GRAPHQL_EXTERNAL_URL?.trim()) return false;
  return isCombinedGraphQLMode();
}
