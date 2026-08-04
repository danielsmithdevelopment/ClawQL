/**
 * MCP Streamable HTTP helpers for protocol 2026-07-28 (stateless) + sessionful defaults.
 */

import { LATEST_PROTOCOL_VERSION as SDK_LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import {
  LATEST_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_2026_07_28,
  SUPPORTED_PROTOCOL_VERSIONS,
  isStatelessProtocolVersion,
  isSupportedProtocolVersion,
} from "mcp-grpc-transport";

export {
  LATEST_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_2026_07_28,
  SUPPORTED_PROTOCOL_VERSIONS,
  isStatelessProtocolVersion,
  isSupportedProtocolVersion,
};

/**
 * Prefer client `mcp-protocol-version` header.
 * Env override: `CLAWQL_MCP_PROTOCOL_VERSION` / `MCP_PROTOCOL_VERSION`.
 * Default (no header/env): SDK latest — **sessionful** Streamable HTTP for IDE clients.
 * Opt into 2026-07-28 explicitly (header or env) for stateless handling.
 */
export function resolveHttpMcpProtocolVersion(
  headerValue: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  const fromHeader = headerValue?.trim();
  if (fromHeader && isSupportedProtocolVersion(fromHeader)) return fromHeader;
  const prefer =
    env.CLAWQL_MCP_PROTOCOL_VERSION?.trim() ||
    env.MCP_PROTOCOL_VERSION?.trim() ||
    SDK_LATEST_PROTOCOL_VERSION;
  return isSupportedProtocolVersion(prefer) ? prefer : SDK_LATEST_PROTOCOL_VERSION;
}

/** Stateless when client declares 2026-07-28 or CLAWQL_MCP_STATELESS=1. */
export function shouldUseStatelessHttpTransport(
  protocolVersion: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (["1", "true", "yes"].includes((env.CLAWQL_MCP_STATELESS ?? "").trim().toLowerCase())) {
    return true;
  }
  return isStatelessProtocolVersion(protocolVersion);
}

export function buildHttpDiscoverResponse(input: {
  protocolVersion: string;
  serverName?: string;
  serverVersion?: string;
  clientInfo?: { name?: string; version?: string };
  clientCapabilities?: Record<string, unknown>;
}): Record<string, unknown> {
  const stateless = isStatelessProtocolVersion(input.protocolVersion);
  return {
    protocolVersion: input.protocolVersion,
    serverInfo: {
      name: input.serverName ?? "clawql-mcp",
      version: input.serverVersion ?? "7.1.0",
    },
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {},
      stateless,
      mrtr: true,
      protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    },
    stateless,
    ...(input.clientInfo ? { clientInfo: input.clientInfo } : {}),
    ...(input.clientCapabilities ? { clientCapabilities: input.clientCapabilities } : {}),
  };
}

export function isDiscoverJsonRpc(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const method = (body as { method?: unknown }).method;
  return method === "discover" || method === "server/discover" || method === "mcp/discover";
}
