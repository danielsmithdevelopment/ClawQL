/**
 * Multi-protocol operation kinds (ADR 0002). Used for stable `operationId` prefixes and future loaders.
 *
 * **clawql-mcp 5.0.0** implements first-class **`graphql`** and **`grpc`** only; other union members are reserved for post-5.0.0 backlog.
 *
 * @see docs/adr/0002-multi-protocol-supergraph.md
 */

/** Logical source kind for merged search / execute (OpenAPI remains `openapi`). */
export type SpecKind =
  | "openapi"
  | "graphql"
  | "the-graph"
  | "grpc"
  | "fabric"
  | "postgres"
  | "sqlite"
  | "redis"
  | "nats-jetstream"
  | "bundled";

/**
 * Sanitize one segment for use inside a multi-part operation id (letters, digits, underscores only).
 * Empty after sanitize becomes `_` so joins never produce ambiguous empty segments.
 */
export function sanitizeOperationSegment(segment: string): string {
  const s = segment.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
  const trimmed = s.replace(/^_|_$/g, "");
  return trimmed.length > 0 ? trimmed : "_";
}

/**
 * Build a collision-resistant operation id for mixed protocol sources: `kind__provider__operation`.
 * Prefer `__` over `:` so MCP clients and URL-adjacent contexts stay safe.
 */
export function normalizeOperationId(
  kind: SpecKind | string,
  provider: string,
  operation: string
): string {
  return [
    sanitizeOperationSegment(String(kind)),
    sanitizeOperationSegment(provider),
    sanitizeOperationSegment(operation),
  ].join("__");
}
