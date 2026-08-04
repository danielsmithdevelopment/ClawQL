/**
 * MCP protocol versions accepted by mcp-grpc-transport.
 *
 * Extends `@modelcontextprotocol/sdk` with **2026-07-28** (stateless core) ahead of
 * full SDK adoption — see https://pragmaticvectors.com/posts/convergence-week/
 */

import {
  LATEST_PROTOCOL_VERSION as SDK_LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS as SDK_SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";

/** MCP 2026-07-28 — stateless core (no sessions / initialize handshake required). */
export const MCP_PROTOCOL_VERSION_2026_07_28 = "2026-07-28";

/** Preferred latest for this transport (stateless protocol). */
export const LATEST_PROTOCOL_VERSION = MCP_PROTOCOL_VERSION_2026_07_28;

/** Versions accepted on `mcp-protocol-version` metadata. */
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  MCP_PROTOCOL_VERSION_2026_07_28,
  ...SDK_SUPPORTED_PROTOCOL_VERSIONS.filter((v) => v !== MCP_PROTOCOL_VERSION_2026_07_28),
];

/** Protocol versions that use the stateless request model (no session affinity). */
export const STATELESS_PROTOCOL_VERSIONS: ReadonlySet<string> = new Set([
  MCP_PROTOCOL_VERSION_2026_07_28,
]);

export function isStatelessProtocolVersion(version: string): boolean {
  return STATELESS_PROTOCOL_VERSIONS.has(version);
}

export function isSupportedProtocolVersion(version: string): boolean {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version);
}

/** Latest version still known to the peer SDK (for Session/JSON-RPC initialize). */
export const SDK_LATEST_PROTOCOL_VERSION_EXPORT = SDK_LATEST_PROTOCOL_VERSION;
