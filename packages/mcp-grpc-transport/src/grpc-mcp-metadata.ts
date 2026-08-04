import * as grpc from "@grpc/grpc-js";
import {
  isSupportedProtocolVersion,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "./protocol-versions.js";

/** gRPC metadata key for MCP protocol version (community protobuf MCP convention). */
export const MCP_PROTOCOL_VERSION_METADATA_KEY = "mcp-protocol-version";

/** Optional per-request client identity (MCP 2026-07-28 `_meta.clientInfo`). */
export const MCP_CLIENT_INFO_METADATA_KEY = "mcp-client-info";

/** Optional routable tool name hint for load balancers / Istio. */
export const MCP_TOOL_NAME_METADATA_KEY = "mcp-tool-name";

export type ProtocolVersionCheck =
  | { ok: true; version: string }
  | { ok: false; details: string; sendLatestInMetadata: boolean };

export function getMetadataValue(metadata: grpc.Metadata, key: string): string | undefined {
  const vals = metadata.get(key);
  if (!vals.length) {
    return undefined;
  }
  const v = vals[0];
  if (Buffer.isBuffer(v)) {
    return v.toString("utf8");
  }
  return String(v);
}

/**
 * gRPC metadata keys are normalized to lowercase ASCII (`@grpc/grpc-js`); this matches
 * case-insensitive lookup for this header.
 */
export function getMetadataValueInsensitive(
  metadata: grpc.Metadata,
  key: string
): string | undefined {
  return getMetadataValue(metadata, key.toLowerCase());
}

export function checkMcpProtocolVersion(metadata: grpc.Metadata): ProtocolVersionCheck {
  const raw =
    getMetadataValue(metadata, MCP_PROTOCOL_VERSION_METADATA_KEY) ??
    getMetadataValueInsensitive(metadata, MCP_PROTOCOL_VERSION_METADATA_KEY);
  if (raw == null || raw === "") {
    const supported = SUPPORTED_PROTOCOL_VERSIONS.join(", ");
    return {
      ok: false,
      details: `Protocol version not provided. Supported versions are: ${supported}`,
      sendLatestInMetadata: true,
    };
  }
  if (!isSupportedProtocolVersion(raw)) {
    const supported = SUPPORTED_PROTOCOL_VERSIONS.join(", ");
    return {
      ok: false,
      details: `Unsupported protocol version: ${raw}. Supported versions are: ${supported}`,
      sendLatestInMetadata: true,
    };
  }
  return { ok: true, version: raw };
}

/**
 * Parse optional JSON `mcp-client-info` metadata (name/version) for 2026-07-28 clients.
 */
export function parseClientInfoFromMetadata(
  metadata: grpc.Metadata
): { name?: string; version?: string } | undefined {
  const raw =
    getMetadataValue(metadata, MCP_CLIENT_INFO_METADATA_KEY) ??
    getMetadataValueInsensitive(metadata, MCP_CLIENT_INFO_METADATA_KEY);
  if (!raw) return undefined;
  try {
    const o = JSON.parse(raw) as { name?: unknown; version?: unknown };
    if (typeof o !== "object" || o == null) return undefined;
    return {
      ...(typeof o.name === "string" ? { name: o.name } : {}),
      ...(typeof o.version === "string" ? { version: o.version } : {}),
    };
  } catch {
    return undefined;
  }
}

export function sendMcpProtocolMetadata(
  call: { sendMetadata: (m: grpc.Metadata) => void },
  version: string
): void {
  const md = new grpc.Metadata();
  md.set(MCP_PROTOCOL_VERSION_METADATA_KEY, version);
  call.sendMetadata(md);
}

export function grpcError(code: grpc.status, details: string): grpc.ServiceError {
  const e = new Error(details) as grpc.ServiceError;
  e.code = code;
  e.details = details;
  return e;
}

export { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS };
export {
  isStatelessProtocolVersion,
  MCP_PROTOCOL_VERSION_2026_07_28,
} from "./protocol-versions.js";
