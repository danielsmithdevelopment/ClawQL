import type { ListedMcpTool } from "mcp-grpc-transport";

export type { ListedMcpTool };

export type ToolCatalog = {
  tools: ListedMcpTool[];
  fetchedAt: string;
  grpcAddress: string;
};

export type McpOpenApiGatewayOptions = {
  /** Upstream gRPC MCP address (`host:port`). */
  grpcAddress: string;
  /** HTTP bind host (default `0.0.0.0`). */
  host?: string;
  /** HTTP listen port (default `8090`). */
  port?: number;
  /** Optional edge API key (`Authorization: Bearer` or `X-API-Key`). */
  apiKey?: string;
  /** MCP protocol version metadata for gRPC RPCs. */
  protocolVersion?: string;
  /** Optional catalog poll interval in ms (0 / unset = no poll). */
  refreshMs?: number;
  /** OpenAPI info title. */
  title?: string;
  /** Server name shown in docs / health. */
  serverName?: string;
};

export type StartedMcpOpenApiGateway = {
  url: string;
  host: string;
  port: number;
  grpcAddress: string;
  close: () => Promise<void>;
  refreshCatalog: () => Promise<ToolCatalog>;
  getCatalog: () => ToolCatalog;
};
