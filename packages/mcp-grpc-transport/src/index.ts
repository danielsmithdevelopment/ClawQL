/**
 * Pluggable gRPC transport for MCP (`@modelcontextprotocol/sdk`).
 * Originated in ClawQL for TypeScript gRPC MCP (see repo README Background).
 * Reference server: https://github.com/danielsmithdevelopment/ClawQL
 *
 * **1.0** — MCP 2026-07-28 stateless protocol + Discover RPC.
 */

export {
  GrpcMcpSessionTransport,
  maybeStartGrpcMcpServer,
  setMcpMessageContextHook,
  defaultGrpcServerMessageSizeBytes,
  PROTOBUF_MCP_SERVICE_FQN,
  MCP_TRANSPORT_SESSION_SERVICE_FQN,
} from "./server.js";
export type { GrpcMcpServerOptions, McpMessageContextHook, StartedGrpcServer } from "./server.js";
export {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  mcpArgumentsToCallToolStructFields,
  resolveGrpcAddressFromEnv,
  resolveGrpcMaxMessageLengthFromEnv,
} from "./grpc-call-tool-client.js";
export type { CallToolGrpcClientOptions } from "./grpc-call-tool-client.js";
export {
  fulfillDependentRequests,
  runUnaryWithDependents,
  parseResumeData,
  encodeResumeData,
  protoSamplingMessageToMcp,
} from "./mcp-protobuf-dependent.js";
export type { DependentHandlers, UnaryWithCommon } from "./mcp-protobuf-dependent.js";
export {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  MCP_PROTOCOL_VERSION_2026_07_28,
  isStatelessProtocolVersion,
  isSupportedProtocolVersion,
} from "./protocol-versions.js";
export {
  MCP_PROTOCOL_VERSION_METADATA_KEY,
  MCP_CLIENT_INFO_METADATA_KEY,
  checkMcpProtocolVersion,
} from "./grpc-mcp-metadata.js";
