/**
 * User-added integration sources (~/.ClawQL/sources.json).
 * Complements bundled providers and CLAWQL_* env for OpenAPI, Discovery, GraphQL, gRPC, MCP, and CLI.
 */

export type CustomSourceKind =
  | "openapi"
  | "discovery"
  | "graphql"
  | "grpc"
  | "mcp"
  | "cli";

export type CustomSourceEntry = {
  /** Stable slug (directory name under ~/.ClawQL/sources/). */
  id: string;
  /** Human label for search results. */
  name: string;
  kind: CustomSourceKind;
  addedAt: string;
  /** Original URL when added via `clawql sources add`. */
  url?: string;
  /** Cached spec path relative to CLAWQL_HOME (e.g. sources/my-api/openapi.json). */
  cachePath?: string;
  /** GraphQL HTTP endpoint (native execute). */
  graphqlEndpoint?: string;
  /** gRPC host:port */
  grpcEndpoint?: string;
  /** Path to .proto (absolute or relative to CLAWQL_HOME). */
  protoPath?: string;
  grpcInsecure?: boolean;
  /** MCP Streamable HTTP URL */
  mcpUrl?: string;
  /** MCP stdio transport */
  mcpCommand?: string;
  mcpArgs?: string[];
  mcpEnv?: Record<string, string>;
  /** CLI wrapper — one execute op runs command + args with JSON args appended. */
  cliCommand?: string;
  cliArgs?: string[];
  cliEnv?: Record<string, string>;
  cliDescription?: string;
};

export type CustomSourcesFile = {
  version: 1;
  sources: CustomSourceEntry[];
};

export function emptyCustomSourcesFile(): CustomSourcesFile {
  return { version: 1, sources: [] };
}

export function slugifySourceId(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s.slice(0, 64) : "source";
}
