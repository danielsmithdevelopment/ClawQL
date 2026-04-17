import * as grpc from "@grpc/grpc-js";
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";

/** gRPC metadata key for MCP protocol version (community protobuf MCP convention). */
export const MCP_PROTOCOL_VERSION_METADATA_KEY = "mcp-protocol-version";

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
export function getMetadataValueInsensitive(metadata: grpc.Metadata, key: string): string | undefined {
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
  if (!SUPPORTED_PROTOCOL_VERSIONS.includes(raw)) {
    const supported = SUPPORTED_PROTOCOL_VERSIONS.join(", ");
    return {
      ok: false,
      details: `Unsupported protocol version: ${raw}. Supported versions are: ${supported}`,
      sendLatestInMetadata: true,
    };
  }
  return { ok: true, version: raw };
}

export function sendMcpProtocolMetadata(call: { sendMetadata: (m: grpc.Metadata) => void }, version: string): void {
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
