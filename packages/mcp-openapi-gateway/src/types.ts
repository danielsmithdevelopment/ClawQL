import type { ListedMcpTool } from "mcp-grpc-transport";
import type { CollapsedToolResult } from "./call.js";

export type { ListedMcpTool };

export type UpstreamKind = "grpc" | "stdio" | "http";

export type ToolCatalog = {
  tools: ListedMcpTool[];
  fetchedAt: string;
  /** Address of the gRPC MCP surface (upstream or locally scaffolded). */
  grpcAddress?: string;
  /** Human-readable upstream label (command, URL, or host:port). */
  upstream: string;
  upstreamKind: UpstreamKind;
  surfaces: Array<"openapi" | "graphql" | "grpc">;
};

/** Invoke one MCP tool and return a collapsed result. */
export type CallToolFn = (
  tool: ListedMcpTool,
  args: Record<string, unknown>
) => Promise<CollapsedToolResult>;

export type McpGatewayHttpOptions = {
  /** HTTP bind host (default `0.0.0.0`). */
  host?: string;
  /** HTTP listen port (default `8090`). */
  port?: number;
  /** Optional edge API key (`Authorization: Bearer` or `X-API-Key`). */
  apiKey?: string;
  /** Optional catalog poll interval in ms (0 / unset = no poll). */
  refreshMs?: number;
  /** OpenAPI / GraphiQL title. */
  title?: string;
  /** Server name shown in docs / health. */
  serverName?: string;
  /** gRPC address advertised in OpenAPI `x-clawql-grpc` (may be local scaffold). */
  grpcAddress?: string;
  /** MCP protocol version metadata when calling upstream gRPC. */
  protocolVersion?: string;
};

/** @deprecated Prefer {@link McpGatewayOptions} / {@link startMcpGateway}. */
export type McpOpenApiGatewayOptions = McpGatewayHttpOptions & {
  grpcAddress: string;
};

export type StartedMcpGateway = {
  url: string;
  host: string;
  port: number;
  /** Present when a gRPC MCP surface is available (upstream or scaffolded). */
  grpcAddress?: string;
  upstream: string;
  upstreamKind: UpstreamKind;
  close: () => Promise<void>;
  refreshCatalog: () => Promise<ToolCatalog>;
  getCatalog: () => ToolCatalog;
};

/** @deprecated Alias of {@link StartedMcpGateway}. */
export type StartedMcpOpenApiGateway = StartedMcpGateway;

export type StdioUpstreamOptions = {
  kind: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type HttpUpstreamOptions = {
  kind: "http";
  /** Streamable HTTP MCP endpoint URL (e.g. `http://127.0.0.1:8080/mcp`). */
  url: string;
};

export type GrpcUpstreamOptions = {
  kind: "grpc";
  /** `host:port` of an MCP gRPC server (`mcp-grpc-transport` / ClawQL). */
  address: string;
  protocolVersion?: string;
};

export type UpstreamOptions = StdioUpstreamOptions | HttpUpstreamOptions | GrpcUpstreamOptions;

export type McpGatewayOptions = McpGatewayHttpOptions & {
  upstream: UpstreamOptions;
  /**
   * Bind address for a **scaffolded** gRPC MCP surface when upstream is stdio/HTTP
   * (default `127.0.0.1:50051`). Set `false` to skip local gRPC.
   * Ignored when upstream is already gRPC (that address is reused).
   */
  grpcListen?: string | false;
};
