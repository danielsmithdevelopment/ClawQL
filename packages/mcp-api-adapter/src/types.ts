import type { ListedMcpTool } from "mcp-grpc-transport";
import type { CollapsedToolResult } from "./call.js";

export type { ListedMcpTool };

export type UpstreamKind = "grpc" | "stdio" | "http";

export type ApiSurface = "openapi" | "graphql" | "mcp" | "grpc" | "websocket" | "mcp-ui";

export type ToolCatalog = {
  tools: ListedMcpTool[];
  fetchedAt: string;
  /** Address of the gRPC MCP API (upstream or locally scaffolded). */
  grpcAddress?: string;
  /** Streamable HTTP MCP path when enabled (e.g. `/mcp`). */
  mcpPath?: string;
  /** HTMX MCP UI path when enabled (e.g. `/mcp-ui`). */
  mcpUiPath?: string;
  /** Human-readable upstream label (command, URL, or host:port). */
  upstream: string;
  upstreamKind: UpstreamKind;
  surfaces: ApiSurface[];
};

/** Invoke one MCP tool and return a collapsed result. */
export type CallToolFn = (
  tool: ListedMcpTool,
  args: Record<string, unknown>
) => Promise<CollapsedToolResult>;

export type McpApiAdapterHttpOptions = {
  /** HTTP bind host (default `0.0.0.0`). */
  host?: string;
  /** HTTP listen port (default `8090`). */
  port?: number;
  /** Optional edge API key (`Authorization: Bearer` or `X-API-Key`). */
  apiKey?: string;
  /**
   * Accept ClawQL-issued MCP access JWTs (with `atr` claim) via JWKS and/or HS256.
   * When set alongside `apiKey`, either credential is accepted.
   */
  jwtAuth?: {
    /** ClawQL AS JWKS URL (`/.well-known/jwks.json`). */
    jwksUrl?: string;
    /** Expected JWT `iss`. */
    issuer?: string;
    /** HS256 secret for tests / single-node (prefer JWKS in production). */
    hs256Secret?: string;
  };
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

/** Options for {@link startMcpApiAdapter}. */
export type McpApiAdapterOptions = McpApiAdapterHttpOptions & {
  upstream: UpstreamOptions;
  /**
   * Bind address for a **scaffolded** gRPC MCP API when upstream is stdio/HTTP
   * (default `127.0.0.1:0`). Set `false` to skip local gRPC.
   * Ignored when upstream is already gRPC (that address is reused).
   */
  grpcListen?: string | false;
  /**
   * Streamable HTTP MCP path to expose (default `/mcp`).
   * Set `false` to disable the MCP HTTP surface.
   */
  mcpPath?: string | false;
  /**
   * WebSocket tool-call path (default `/ws`).
   * Set `false` to disable the WebSocket surface.
   */
  wsPath?: string | false;
  /**
   * HTMX MCP UI playground path (default `/mcp-ui`).
   * Set `false` to disable the browser UI surface.
   */
  mcpUiPath?: string | false;
  /**
   * When true (default), `/mcp-ui` filters catalog + execute by the caller's ATR.
   * JWT scopes/tools control visibility; API keys are treated as admin.
   * Set `false` to show the full catalog regardless of ATR (open demos).
   */
  mcpUiAtrScoped?: boolean;
};

export type StartedMcpApiAdapter = {
  url: string;
  host: string;
  port: number;
  /** Present when a gRPC MCP API is available (upstream or scaffolded). */
  grpcAddress?: string;
  /** Streamable HTTP MCP path when enabled. */
  mcpPath?: string;
  /** HTMX MCP UI path when enabled (e.g. `/mcp-ui`). */
  mcpUiPath?: string;
  /** WebSocket tool-call path when enabled (e.g. `/ws`). */
  wsPath?: string;
  /** `ws://host:port/ws` when the WebSocket surface is enabled. */
  wsUrl?: string;
  upstream: string;
  upstreamKind: UpstreamKind;
  close: () => Promise<void>;
  refreshCatalog: () => Promise<ToolCatalog>;
  getCatalog: () => ToolCatalog;
};

/** @deprecated Use {@link McpApiAdapterOptions}. */
export type McpGatewayOptions = McpApiAdapterOptions;
/** @deprecated Use {@link StartedMcpApiAdapter}. */
export type StartedMcpGateway = StartedMcpApiAdapter;
/** @deprecated Use {@link McpApiAdapterHttpOptions} + `upstream: { kind: "grpc", address }`. */
export type McpOpenApiGatewayOptions = McpApiAdapterHttpOptions & {
  grpcAddress: string;
};
/** @deprecated Alias of {@link StartedMcpApiAdapter}. */
export type StartedMcpOpenApiGateway = StartedMcpApiAdapter;
