import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import { callToolViaGrpc, httpBodyFromCollapsed } from "./call.js";
import { fetchToolCatalog } from "./catalog.js";
import { swaggerDocsHtml } from "./docs-html.js";
import { buildOpenApiDocument } from "./openapi.js";
import { isSafeToolPathName } from "./schema-convert.js";
import type {
  McpOpenApiGatewayOptions,
  StartedMcpOpenApiGateway,
  ToolCatalog,
} from "./types.js";

function readApiKey(req: Request): string | undefined {
  const headerKey = req.header("x-api-key")?.trim();
  if (headerKey) return headerKey;
  const auth = req.header("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return undefined;
}

export function createMcpOpenApiApp(
  options: McpOpenApiGatewayOptions & { getCatalog: () => ToolCatalog }
): Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const apiKey = options.apiKey?.trim();
  if (apiKey) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === "/healthz") return next();
      const provided = readApiKey(req);
      if (provided !== apiKey) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      next();
    });
  }

  app.get("/healthz", (_req, res) => {
    const catalog = options.getCatalog();
    res.json({
      status: "ok",
      service: options.serverName ?? "mcp-openapi-gateway",
      grpcAddress: options.grpcAddress,
      toolCount: catalog.tools.length,
      fetchedAt: catalog.fetchedAt,
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
        grpcAddress: options.grpcAddress,
        publicBaseUrl,
      })
    );
  });

  app.get("/docs", (_req, res) => {
    res.type("html").send(swaggerDocsHtml(options.title ?? "MCP OpenAPI Gateway"));
  });

  app.post("/:toolName", async (req, res) => {
    const toolName = String(req.params.toolName ?? "");
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
      const result = await callToolViaGrpc({
        grpcAddress: options.grpcAddress,
        tool,
        arguments: args,
        protocolVersion: options.protocolVersion,
      });
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

export async function startMcpOpenApiGateway(
  options: McpOpenApiGatewayOptions
): Promise<StartedMcpOpenApiGateway> {
  let catalog = await fetchToolCatalog({
    grpcAddress: options.grpcAddress,
    protocolVersion: options.protocolVersion,
  });

  const app = createMcpOpenApiApp({
    ...options,
    getCatalog: () => catalog,
  });

  const host = options.host?.trim() || "0.0.0.0";
  const port = options.port ?? 8090;

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.on("error", reject);
  });

  const addr = server.address();
  const boundPort =
    typeof addr === "object" && addr && "port" in addr ? addr.port : port;

  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  const refreshMs = options.refreshMs ?? 0;
  if (refreshMs > 0) {
    refreshTimer = setInterval(() => {
      void fetchToolCatalog({
        grpcAddress: options.grpcAddress,
        protocolVersion: options.protocolVersion,
      })
        .then((next) => {
          catalog = next;
        })
        .catch((err) => {
          console.error("[mcp-openapi-gateway] catalog refresh failed:", err);
        });
    }, refreshMs);
    refreshTimer.unref?.();
  }

  const refreshCatalog = async () => {
    catalog = await fetchToolCatalog({
      grpcAddress: options.grpcAddress,
      protocolVersion: options.protocolVersion,
    });
    return catalog;
  };

  return {
    url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${boundPort}`,
    host,
    port: boundPort,
    grpcAddress: options.grpcAddress,
    getCatalog: () => catalog,
    refreshCatalog,
    close: async () => {
      if (refreshTimer) clearInterval(refreshTimer);
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
