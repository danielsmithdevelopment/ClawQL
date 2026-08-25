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
} from "./edge-auth.js";
export type {
  McpApiAdapterJwtAuthOptions,
  McpApiAdapterEdgeAuthOptions,
  VerifiedMcpAdapterAtr,
} from "./edge-auth.js";
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
export type { CollapsedToolResult } from "./call.js";
export type { UpstreamConnection } from "./upstream.js";
export type { CreateMcpApiAdapterAppOptions } from "./server.js";
export type { GenCliOptions } from "./gen-cli.js";
export type { AttachMcpHttpOptions } from "./mcp-http.js";
export type { AttachMcpUiOptions } from "./mcp-ui-http.js";
export type {
  AttachWebSocketSurfaceOptions,
  AttachedWebSocketSurface,
  ParsedWsToolCall,
} from "./websocket.js";
