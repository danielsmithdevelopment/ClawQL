import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import { httpBodyFromCollapsed } from "./call.js";
import { refreshCatalog } from "./catalog.js";
import { swaggerDocsHtml } from "./docs-html.js";
import {
  createJwtVerifier,
  edgeAuthConfigured,
  verifyEdgeCredential,
  type McpApiAdapterJwtAuthOptions,
} from "./edge-auth.js";
import { createEdgeAuthRateLimiter } from "./edge-rate-limit.js";
import { attachGraphqlRoutes } from "./graphql-http.js";
import { attachMcpHttpRoutes } from "./mcp-http.js";
import { buildOpenApiDocument } from "./openapi.js";
import { isSafeToolPathName } from "./schema-convert.js";
import type {
  CallToolFn,
  McpApiAdapterOptions,
  McpOpenApiGatewayOptions,
  StartedMcpApiAdapter,
  ToolCatalog,
} from "./types.js";
import { buildCatalogFromUpstream, connectUpstream, type UpstreamConnection } from "./upstream.js";
import { attachWebSocketSurface, DEFAULT_WS_PATH } from "./websocket.js";

function readApiKey(req: Request): string | undefined {
  const headerKey = req.header("x-api-key")?.trim();
  if (headerKey) return headerKey;
  const auth = req.header("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function resolveMcpPath(mcpPath: string | false | undefined): string | undefined {
  if (mcpPath === false) return undefined;
  if (mcpPath === undefined) return "/mcp";
  const trimmed = mcpPath.trim();
  if (!trimmed || trimmed === "/") return "/mcp";
  return trimmed.startsWith("/") ? trimmed.replace(/\/$/, "") || "/mcp" : `/${trimmed}`;
}

function resolveWsPath(wsPath: string | false | undefined): string | undefined {
  if (wsPath === false) return undefined;
  if (wsPath === undefined) return DEFAULT_WS_PATH;
  const trimmed = wsPath.trim();
  if (!trimmed || trimmed === "/") return DEFAULT_WS_PATH;
  return trimmed.startsWith("/") ? trimmed.replace(/\/$/, "") || DEFAULT_WS_PATH : `/${trimmed}`;
}

export type CreateMcpApiAdapterAppOptions = {
  getCatalog: () => ToolCatalog;
  callTool: CallToolFn;
  apiKey?: string;
  jwtAuth?: McpApiAdapterJwtAuthOptions;
  title?: string;
  serverName?: string;
  grpcAddress?: string;
  /** When set, mount Streamable HTTP MCP at this path (before `/:toolName`). */
  mcpPath?: string;
  /** WebSocket path when enabled (advertised on /healthz). */
  wsPath?: string;
  createBridgedMcpServer?: () => import("@modelcontextprotocol/sdk/server/mcp.js").McpServer;
};

export function createMcpApiAdapterApp(options: CreateMcpApiAdapterAppOptions): Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const verifyJwt = createJwtVerifier(options.jwtAuth ?? {});
  if (edgeAuthConfigured({ apiKey: options.apiKey, jwt: options.jwtAuth })) {
    app.use(createEdgeAuthRateLimiter());
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === "/healthz") return next();
      void verifyEdgeCredential(
        readApiKey(req),
        { apiKey: options.apiKey, jwt: options.jwtAuth },
        verifyJwt
      )
        .then((ok) => {
          if (!ok) {
            res.status(401).json({ error: "unauthorized" });
            return;
          }
          next();
        })
        .catch(() => {
          res.status(401).json({ error: "unauthorized" });
        });
    });
  }

  app.get("/healthz", (_req, res) => {
    const catalog = options.getCatalog();
    res.json({
      status: "ok",
      service: options.serverName ?? "mcp-api-adapter",
      upstream: catalog.upstream,
      upstreamKind: catalog.upstreamKind,
      grpcAddress: catalog.grpcAddress ?? options.grpcAddress,
      mcpPath: catalog.mcpPath ?? options.mcpPath,
      wsPath: options.wsPath,
      toolCount: catalog.tools.length,
      fetchedAt: catalog.fetchedAt,
      surfaces: catalog.surfaces,
    });
  });

  app.get("/tools", (_req, res) => {
    res.json(options.getCatalog());
  });

  app.get("/openapi.json", (req, res) => {
    const catalog = options.getCatalog();
    const proto = req.protocol;
    const host = req.get("host");
    const publicBaseUrl = host ? `${proto}://${host}` : undefined;
    res.json(
      buildOpenApiDocument({
        tools: catalog.tools,
        title: options.title,
        serverName: options.serverName,
        grpcAddress: catalog.grpcAddress ?? options.grpcAddress,
        publicBaseUrl,
        mcpPath: catalog.mcpPath ?? options.mcpPath,
      })
    );
  });

  app.get("/docs", (_req, res) => {
    res.type("html").send(swaggerDocsHtml(options.title ?? "MCP API Adapter"));
  });

  attachGraphqlRoutes(app, {
    callTool: options.callTool,
    getCatalog: options.getCatalog,
    title: options.title,
    grpcAddress: options.grpcAddress,
  });

  if (options.mcpPath && options.createBridgedMcpServer) {
    attachMcpHttpRoutes(app, {
      path: options.mcpPath,
      createMcpServer: options.createBridgedMcpServer,
    });
  }

  const reserved = new Set(
    ["tools", "docs", "openapi.json", "healthz", "graphql", "graphiql", "mcp", "ws"].concat(
      options.mcpPath ? [options.mcpPath.replace(/^\//, "")] : []
    )
  );

  app.post("/:toolName", async (req, res) => {
    const toolName = String(req.params.toolName ?? "");
    if (reserved.has(toolName) || toolName.includes(".")) {
      res.status(404).json({ error: `unknown tool: ${toolName}` });
      return;
    }
    if (!isSafeToolPathName(toolName)) {
      res.status(400).json({ error: "invalid tool name" });
      return;
    }
    const catalog = options.getCatalog();
    const tool = catalog.tools.find((t) => t.name === toolName);
    if (!tool) {
      res.status(404).json({ error: `unknown tool: ${toolName}` });
      return;
    }
    const args =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    try {
      const result = await options.callTool(tool, args);
      res.json(httpBodyFromCollapsed(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const withResult = err as Error & { result?: unknown };
      res.status(502).json({
        error: "upstream CallTool failed",
        message,
        result: withResult.result,
      });
    }
  });

  return app;
}

/** @deprecated Prefer {@link createMcpApiAdapterApp}. */
export const createMcpGatewayApp = createMcpApiAdapterApp;
/** @deprecated Prefer {@link createMcpApiAdapterApp}. */
export function createMcpOpenApiApp(
  options: McpOpenApiGatewayOptions & { getCatalog: () => ToolCatalog }
): Express {
  return createMcpApiAdapterApp({
    getCatalog: options.getCatalog,
    callTool: async (tool, args) => {
      const { callToolViaGrpc } = await import("./call.js");
      return callToolViaGrpc({
        grpcAddress: options.grpcAddress,
        tool,
        arguments: args,
        protocolVersion: options.protocolVersion,
      });
    },
    apiKey: options.apiKey,
    title: options.title,
    serverName: options.serverName,
    grpcAddress: options.grpcAddress,
  });
}

async function listenHttp(
  app: Express,
  host: string,
  port: number
): Promise<{ server: Server; boundPort: number }> {
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", reject);
  });
  const addr = server.address();
  const boundPort = typeof addr === "object" && addr && "port" in addr ? addr.port : port;
  return { server, boundPort };
}

function attachRefreshTimer(
  upstream: UpstreamConnection,
  mcpPath: string | undefined,
  wsPath: string | undefined,
  setCatalog: (c: ToolCatalog) => void,
  refreshMs: number
): ReturnType<typeof setInterval> | undefined {
  if (refreshMs <= 0) return undefined;
  const timer = setInterval(() => {
    void refreshCatalog(upstream, mcpPath, wsPath)
      .then((next) => setCatalog(next))
      .catch((err) => {
        console.error("[mcp-api-adapter] catalog refresh failed:", err);
      });
  }, refreshMs);
  timer.unref?.();
  return timer;
}

/**
 * Point at any MCP server (stdio | Streamable HTTP | gRPC) and serve
 * OpenAPI + GraphQL + Streamable HTTP `/mcp` + WebSocket `/ws` + (optional) gRPC for the same tools.
 */
export async function startMcpApiAdapter(
  options: McpApiAdapterOptions
): Promise<StartedMcpApiAdapter> {
  const mcpPath = resolveMcpPath(options.mcpPath);
  const wsPath = resolveWsPath(options.wsPath);
  const upstream = await connectUpstream(options.upstream, {
    grpcListen: options.grpcListen,
  });

  let catalog = buildCatalogFromUpstream(upstream, { mcpPath, wsPath });

  const app = createMcpApiAdapterApp({
    getCatalog: () => catalog,
    callTool: upstream.callTool,
    apiKey: options.apiKey,
    jwtAuth: options.jwtAuth,
    title: options.title,
    serverName: options.serverName,
    grpcAddress: upstream.grpcAddress ?? options.grpcAddress,
    mcpPath,
    wsPath,
    createBridgedMcpServer: mcpPath ? upstream.createBridgedMcpServer : undefined,
  });

  const host = options.host?.trim() || "0.0.0.0";
  const port = options.port ?? 8090;
  const { server, boundPort } = await listenHttp(app, host, port);

  const ws =
    wsPath != null
      ? attachWebSocketSurface({
          server,
          path: wsPath,
          getCatalog: () => catalog,
          callTool: upstream.callTool,
          apiKey: options.apiKey,
          jwtAuth: options.jwtAuth,
        })
      : undefined;

  const refreshTimer = attachRefreshTimer(
    upstream,
    mcpPath,
    wsPath,
    (next) => {
      catalog = next;
    },
    options.refreshMs ?? 0
  );

  const publicHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  const url = `http://${publicHost}:${boundPort}`;
  const wsUrl = ws ? `ws://${publicHost}:${boundPort}${ws.path}` : undefined;

  return {
    url,
    host,
    port: boundPort,
    grpcAddress: upstream.grpcAddress,
    mcpPath,
    wsPath: ws?.path,
    wsUrl,
    upstream: upstream.label,
    upstreamKind: upstream.kind,
    getCatalog: () => catalog,
    refreshCatalog: async () => {
      const tools = await upstream.refreshTools();
      catalog = buildCatalogFromUpstream(upstream, { tools, mcpPath, wsPath });
      return catalog;
    },
    close: async () => {
      if (refreshTimer) clearInterval(refreshTimer);
      if (ws) await ws.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await upstream.close();
    },
  };
}

/** @deprecated Prefer {@link startMcpApiAdapter}. */
export const startMcpGateway = startMcpApiAdapter;

/** @deprecated Prefer {@link startMcpApiAdapter} with `upstream: { kind: "grpc", address }`. */
export async function startMcpOpenApiGateway(
  options: McpOpenApiGatewayOptions
): Promise<StartedMcpApiAdapter> {
  return startMcpApiAdapter({
    ...options,
    upstream: {
      kind: "grpc",
      address: options.grpcAddress,
      protocolVersion: options.protocolVersion,
    },
    grpcListen: false,
  });
}
