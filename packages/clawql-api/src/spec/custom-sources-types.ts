/**
 * User-added integration sources (~/.ClawQL/sources.json).
 * Complements bundled providers and CLAWQL_* env for OpenAPI, Discovery, GraphQL, gRPC, MCP, and CLI.
 */

import { assertSafeSourceId } from "./custom-sources-security.js";

export type CustomSourceKind = "openapi" | "discovery" | "graphql" | "grpc" | "mcp" | "cli";

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
  const trimmed = input.trim().toLowerCase().slice(0, 128);
  let s = "";
  for (const ch of trimmed) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) s += ch;
    else if (ch === "-" || ch === "_" || ch === " " || ch === ".") s += "-";
  }
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === "-") start += 1;
  while (end > start && s[end - 1] === "-") end -= 1;
  const trimmedDashes = s.slice(start, end);
  const out = trimmedDashes.length > 0 ? trimmedDashes.slice(0, 64) : "source";
  return assertSafeSourceId(out);
}
