/**
 * server-http.ts — ClawQL MCP Server over Streamable HTTP
 *
 * Remote MCP entrypoint for agents that connect via URL.
 * Exposes MCP on /mcp, health on /healthz, and Prometheus metrics on /metrics (unless disabled).
 */

import "./load-env.js";
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { attachGraphqlHttpToMcpApp } from "./graphql-http-attach.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { loadSpec, registerSpecCacheShutdownHooks } from "./spec-loader.js";
import { preloadSchemaFieldCacheFromDisk } from "./tools.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { getObsidianVaultPath, validateObsidianVaultAtStartup } from "./vault-config.js";
import { registerOuroborosPoolShutdownHooks } from "./ouroboros/postgres-pool.js";
import { registerPostgresPoolShutdownHooks } from "./vector-store/pgvector.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { registerScheduleWorkerShutdownHooks, startScheduleWorker } from "./clawql-schedule.js";
import {
  getNativeProtocolMetricsSnapshot,
  nativeProtocolMetricsEnabled,
} from "./native-protocol-metrics.js";
import {
  prometheusDisabledForHttp,
  renderPrometheusMetrics,
} from "./native-protocol-prometheus.js";
import { maybeInitOtelTracing } from "./otel-tracing.js";

const PORT = Number.parseInt(process.env.PORT ?? process.env.MCP_PORT ?? "8080", 10);
const DEFAULT_MCP_PATH = "/mcp";

/**
 * When `CLAWQL_CORS_ALLOW_ORIGIN` is set (e.g. `*` for Gallery / mobile webviews),
 * enable CORS + OPTIONS preflight so browser `fetch` to `/mcp` works.
 */
function applyCorsIfConfigured(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const allow = process.env.CLAWQL_CORS_ALLOW_ORIGIN?.trim();
  if (!allow) {
    next();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", allow);
  if (allow !== "*") {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, mcp-session-id, mcp-protocol-version"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "mcp-session-id, Mcp-Session-Id, mcp-protocol-version"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function jsonRpcError(res: import("express").Response, message: string, code = -32000): void {
  res.status(400).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

export type CreateMcpHttpAppOptions = {
  /** Override MCP route (default `process.env.MCP_PATH` or `/mcp`). */
  mcpPath?: string;
  /** Express / DNS rebinding host (default `process.env.MCP_HOST` or `0.0.0.0`). */
  host?: string;
  /** Skip spec preload (tests that mock `loadSpec` upstream). */
  skipSpecPreload?: boolean;
};

/**
 * Build Express app with `/healthz`, **`/metrics`** (Prometheus unless **`CLAWQL_DISABLE_HTTP_METRICS=1`**), and Streamable HTTP MCP on `mcpPath`.
 * Each call uses a fresh session transport map (safe for parallel tests).
 */
export async function createMcpHttpApp(options: CreateMcpHttpAppOptions = {}): Promise<Express> {
  if (!options.skipSpecPreload) {
    await loadSpec();
    await preloadSchemaFieldCacheFromDisk();
    await validateObsidianVaultAtStartup();
  }

  const mcpPath = options.mcpPath?.trim() || process.env.MCP_PATH?.trim() || DEFAULT_MCP_PATH;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const app = createMcpExpressApp({
    host: options.host || process.env.MCP_HOST || "0.0.0.0",
  });

  app.use(applyCorsIfConfigured);

  await attachGraphqlHttpToMcpApp(app);

  if (!prometheusDisabledForHttp()) {
    app.get("/metrics", async (_req, res) => {
      try {
        const { body, contentType } = await renderPrometheusMetrics();
        res.setHeader("Content-Type", contentType);
        res.status(200).send(body);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] GET /metrics error:", err);
        if (!res.headersSent) {
          res
            .status(500)
            .type("text/plain")
            .send(err instanceof Error ? err.message : String(err));
        }
      }
    });
  }

  app.get("/healthz", async (_req, res) => {
    const base: Record<string, unknown> = {
      status: "ok",
      transport: "streamable-http",
      endpoint: mcpPath,
    };
    if (nativeProtocolMetricsEnabled()) {
      base.nativeProtocolMetrics = getNativeProtocolMetricsSnapshot();
    }
    if (process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS?.trim() === "1") {
      try {
        const vault = getObsidianVaultPath();
        if (vault) {
          const {
            loadCuckooArtifactUpdatedAt,
            loadVaultMerkleSnapshotFromDb,
            memoryDbSyncEnabled,
          } = await import("./memory-db.js");
          if (memoryDbSyncEnabled()) {
            if (process.env.CLAWQL_MERKLE_ENABLED === "1") {
              base.merkleSnapshot = await loadVaultMerkleSnapshotFromDb(vault);
            }
            if (process.env.CLAWQL_CUCKOO_ENABLED === "1") {
              base.cuckooMembershipArtifactsEnabled = true;
              const { getCuckooMetricsSnapshot } = await import("./memory-cuckoo-metrics.js");
              base.cuckooMetrics = getCuckooMetricsSnapshot();
              base.cuckooFilterPersistedAt = await loadCuckooArtifactUpdatedAt(vault);
            }
          }
        }
      } catch {
        /* optional enrichment — ignore */
      }
    }
    res.json(base);
  });

  app.post(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
          },
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) transports.delete(sid);
        };

        const server = createRegisteredMcpServer();
        await server.connect(transport);
      } else {
        jsonRpcError(
          res,
          "Bad Request: missing/invalid mcp-session-id, or initialize request required."
        );
        return;
      }

      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      console.error("[clawql-mcp-http] POST /mcp error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await transport.handleRequest(req, res);
  });

  app.delete(mcpPath, async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId) {
      jsonRpcError(res, "Bad Request: missing mcp-session-id.");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      jsonRpcError(res, "Bad Request: invalid mcp-session-id.");
      return;
    }
    await transport.handleRequest(req, res);
  });

  return app;
}

async function main() {
  await maybeInitOtelTracing();
  registerSpecCacheShutdownHooks();
  registerPostgresPoolShutdownHooks();
  registerOuroborosPoolShutdownHooks();
  if (getClawqlOptionalToolFlags().enableSchedule) {
    registerScheduleWorkerShutdownHooks();
    startScheduleWorker();
  }
  const app = await createMcpHttpApp();
  const grpcPromise = maybeStartGrpcMcpServer({
    createMcpServer: () => createRegisteredMcpServer(),
  });

  app.listen(PORT, () => {
    const path = process.env.MCP_PATH?.trim() || DEFAULT_MCP_PATH;
    console.error(
      `[clawql-mcp-http] Streamable HTTP MCP listening on http://0.0.0.0:${PORT}${path}`
    );
  });

  const grpc = await grpcPromise;
  if (grpc) {
    const refl = grpc.reflectionEnabled ? " reflection=on" : "";
    console.error(
      `[clawql-mcp-http] gRPC listening on ${grpc.address} (mcp-grpc-transport ${grpc.version}; grpc.health.v1.Health, model_context_protocol.Mcp, mcp.transport.v1.Mcp.Session${refl})`
    );
  }
}

main().catch((err) => {
  console.error("[clawql-mcp-http] Fatal startup error:", err);
  process.exit(1);
});
