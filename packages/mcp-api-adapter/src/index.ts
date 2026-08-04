/**
 * mcp-api-adapter — standalone adapter: any MCP server → OpenAPI + GraphQL + /mcp + gRPC.
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
