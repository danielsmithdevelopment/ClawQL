/**
 * MCP OpenAPI Gateway — REST on-ramp over mcp-grpc-transport CallTool.
 */

export { startMcpOpenApiGateway, createMcpOpenApiApp } from "./server.js";
export { buildOpenApiDocument } from "./openapi.js";
export { fetchToolCatalog } from "./catalog.js";
export { callToolViaGrpc, collapseCallToolMessages, httpBodyFromCollapsed } from "./call.js";
export {
  isSafeToolPathName,
  jsonSchemaToOpenApiSchema,
  asObjectRequestSchema,
} from "./schema-convert.js";
export { runCli } from "./cli.js";
export type {
  McpOpenApiGatewayOptions,
  StartedMcpOpenApiGateway,
  ToolCatalog,
  ListedMcpTool,
} from "./types.js";
export type { CollapsedToolResult } from "./call.js";
