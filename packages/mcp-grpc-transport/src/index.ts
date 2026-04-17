/**
 * Pluggable gRPC transport for MCP (`@modelcontextprotocol/sdk`).
 * Originated in ClawQL for TypeScript gRPC MCP (see repo README Background).
 * Reference server: https://github.com/danielsmithdevelopment/ClawQL
 */

export {
  GrpcMcpSessionTransport,
  maybeStartGrpcMcpServer,
  PROTOBUF_MCP_SERVICE_FQN,
  MCP_TRANSPORT_SESSION_SERVICE_FQN,
} from "./server.js";
export type { GrpcMcpServerOptions, StartedGrpcServer } from "./server.js";
export {
  fulfillDependentRequests,
  runUnaryWithDependents,
  parseResumeData,
  encodeResumeData,
  protoSamplingMessageToMcp,
} from "./mcp-protobuf-dependent.js";
export type { DependentHandlers, UnaryWithCommon } from "./mcp-protobuf-dependent.js";
