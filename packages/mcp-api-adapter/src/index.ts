/**
 * mcp-api-adapter — standalone adapter: any MCP server → OpenAPI + GraphQL + gRPC.
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
export { fetchToolCatalog, refreshCatalog } from "./catalog.js";
export { connectUpstream, buildCatalogFromUpstream } from "./upstream.js";
export {
  callToolViaGrpc,
  collapseCallToolMessages,
  collapseSdkToolResult,
  httpBodyFromCollapsed,
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
  StdioUpstreamOptions,
  HttpUpstreamOptions,
  GrpcUpstreamOptions,
} from "./types.js";
export type { CollapsedToolResult } from "./call.js";
export type { UpstreamConnection } from "./upstream.js";
export type { CreateMcpApiAdapterAppOptions } from "./server.js";
