/**
 * mcp-api-adapter — standalone adapter: any MCP server → OpenAPI + GraphQL + /mcp + gRPC + WebSocket + /mcp-ui.
 */

export {
  startMcpApiAdapter,
  startMcpGateway,
  startMcpOpenApiGateway,
  createMcpApiAdapterApp,
  createMcpGatewayApp,
  createMcpOpenApiApp,
} from "./server.js";
export { buildOpenApiDocument } from "./openapi.js";
export { buildGraphqlSchemaFromCatalog, toolArgsFromInputSchema } from "./graphql-schema.js";
export { attachGraphqlRoutes } from "./graphql-http.js";
export { attachMcpHttpRoutes } from "./mcp-http.js";
export { attachMcpUiRoutes, DEFAULT_MCP_UI_PATH } from "./mcp-ui-http.js";
export { formHintsForTool, isSmartUploadTool, listMcpUiTemplates, resolveMcpUiTemplate } from "./mcp-ui-templates.js";
export { renderSmartUploadFragment } from "./mcp-ui-smart-upload-html.js";
export {
  attachWebSocketSurface,
  parseWsToolCall,
  DEFAULT_WS_PATH,
} from "./websocket.js";
export { generateToolCli, renderGeneratedCliSource } from "./gen-cli.js";
export { fetchToolCatalog, refreshCatalog } from "./catalog.js";
export { connectUpstream, buildCatalogFromUpstream, catalogSurfaces } from "./upstream.js";
export {
  callToolViaGrpc,
  collapseCallToolMessages,
  collapseSdkToolResult,
  httpBodyFromCollapsed,
  mcpCallToolResultFromCollapsed,
} from "./call.js";
export {
  isSafeToolPathName,
  jsonSchemaToOpenApiSchema,
  asObjectRequestSchema,
} from "./schema-convert.js";
export { runCli } from "./cli.js";
export {
  createJwtVerifier,
  edgeAuthConfigured,
  verifyEdgeCredential,
  resolveEdgeCredential,
} from "./edge-auth.js";
export type {
  McpApiAdapterJwtAuthOptions,
  McpApiAdapterEdgeAuthOptions,
  VerifiedMcpAdapterAtr,
} from "./edge-auth.js";
export {
  canProcessDocuments,
  filterToolsForAtr,
  isInternalToolName,
  isToolAuthorizedForAtr,
  INTERNAL_TOOL_PREFIXES,
} from "./mcp-ui-atr.js";
export {
  createGeneratedUi,
  getGeneratedUiBySlug,
  listGeneratedUis,
} from "./mcp-ui-generate.js";
export {
  createProgressJob,
  getProgressJob,
  isLongRunningTool,
  DEFAULT_LONG_RUNNING_TOOLS,
} from "./mcp-ui-progress.js";
export { mergeFilesIntoArgs, isMultipartRequest } from "./mcp-ui-multipart.js";
export {
  allocateInputFrameTokens,
  buildContextFlamegraph,
  coalesceFramesBySource,
  demoCompressedVsFatRecords,
  demoTraceTokenizationMeta,
  estimateTokensFromChars,
  meteredInputFromMessages,
  resolveTraceRecords,
  DEMO_TRACE_SESSION_COMPRESSED,
  DEMO_TRACE_SESSION_FAT,
  TRACE_SOURCE_ORDER,
} from "./mcp-ui-trace.js";
export {
  createListTraceCallsFromStore,
  inferenceRecordsToTraceCalls,
  liveTraceTokenizationMeta,
  resolveListTraceCallsFromEnv,
} from "./inference-trace-bridge.js";
export type { InferenceRecordLike } from "./inference-trace-bridge.js";
export {
  renderContextFlamegraphPage,
  renderTraceComparePage,
  renderTraceNotFoundPage,
} from "./mcp-ui-trace-html.js";
export type {
  McpApiAdapterOptions,
  McpApiAdapterHttpOptions,
  McpGatewayOptions,
  McpOpenApiGatewayOptions,
  StartedMcpApiAdapter,
  StartedMcpGateway,
  StartedMcpOpenApiGateway,
  ToolCatalog,
  ListedMcpTool,
  UpstreamOptions,
  UpstreamKind,
  CallToolFn,
  ApiSurface,
  StdioUpstreamOptions,
  HttpUpstreamOptions,
  GrpcUpstreamOptions,
} from "./types.js";
export type {
  ContextFlamegraph,
  TraceCallMessage,
  TraceCallRecord,
  TraceFrame,
  TraceSource,
} from "./mcp-ui-trace.js";
export type { CollapsedToolResult } from "./call.js";
export type { UpstreamConnection } from "./upstream.js";
export type { CreateMcpApiAdapterAppOptions } from "./server.js";
export type { GenCliOptions } from "./gen-cli.js";
export type { AttachMcpHttpOptions } from "./mcp-http.js";
export {
  McpApiAdapterService,
  McpApiAdapterError,
  McpApiAdapterServiceLive,
  runMcpApiAdapterEffect,
} from "./effect/mcp-api-adapter-service.js";
export type { AttachMcpUiOptions } from "./mcp-ui-http.js";
export type {
  AttachWebSocketSurfaceOptions,
  AttachedWebSocketSurface,
  ParsedWsToolCall,
} from "./websocket.js";
