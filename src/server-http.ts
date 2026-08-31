/**
 * server-http.ts — ClawQL MCP Server over Streamable HTTP
 *
 * Remote MCP entrypoint for agents that connect via URL.
 * Exposes MCP on /mcp, health on /healthz, and Prometheus metrics on /metrics (unless disabled).
 */

import "./load-env.js";
import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { attachGraphqlHttpToMcpApp } from "./graphql-http-attach.js";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import {
  fireSessionEnd,
  fireSessionStart,
  loadSpec,
  registerSpecCacheShutdownHooks,
} from "clawql-api";
import { getClawqlApi } from "./clawql-api-adapters.js";
import { preloadSchemaFieldCacheFromDisk } from "./tools.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import {
  buildHttpDiscoverResponse,
  isDiscoverJsonRpc,
  MCP_PROTOCOL_VERSION_2026_07_28,
  resolveHttpMcpProtocolVersion,
  shouldUseStatelessHttpTransport,
} from "./mcp-http-protocol.js";
import {
  getObsidianVaultPath,
  getVaultStartupStatus,
  validateOrDegradeObsidianVaultAtStartup,
} from "./vault-config.js";
import { registerPostgresPoolShutdownHooks } from "clawql-memory/vector/pgvector";
import { type ClawqlOptionalToolFlags } from "clawql-api";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";
import { getNativeProtocolMetricsSnapshot, nativeProtocolMetricsEnabled } from "clawql-api";
import { httpMetricsEnabledForHttp, renderPrometheusMetrics } from "clawql-api";
import { maybeInitOtelTracing } from "./otel-tracing.js";
import { maybeVerifyReleaseManifestAtStartup } from "./release-manifest-startup.js";
import { handleLabelStudioWebhookRequest } from "clawql-automation/hitl/label-studio";
import { configureHitlTransportDeps } from "./hitl-transport.js";
import { handleConeshareWebhookRequest } from "./coneshare-webhook.js";
import { handleNextcloudWebhookRequest } from "./nextcloud-webhook.js";
import { handleIdpPipelineRunRequest } from "./idp-pipeline-run-http.js";
import { handleLangfuseEvalWebhookRequest } from "./langfuse-eval-webhook.js";
import { createWebhookRateLimiter } from "./webhook-rate-limit.js";
import { createMcpOAuthRateLimiter } from "./mcp-oauth-rate-limit.js";
import {
  attachMcpOAuthRoutes,
  createIdJagIssuerFromEnv,
  createMcpOAuthFromEnv,
  isIdJagIssuerEnabled,
  isMcpOAuthEnabled,
  resolveAtrClaimsFromHeadersEffect,
  resolveSecretStore,
  warnIfMcpOAuthAuditDisabled,
  warnIfMcpOAuthHs256Only,
  warnIfMcpOAuthAdminKeyMissing,
  type AtrClaims,
  type IdJagIssuerRuntime,
  type McpOAuthRuntime,
} from "clawql-auth";
import { Effect } from "effect";
import { attachCreditsHateoasRoutes } from "clawql-payments";
import { attachPaymentsWellKnownRoutes } from "clawql-payments/discovery";
import { attachMppOpenApiRoutes, isMppOpenApiEnabled } from "clawql-payments/mpp";
import {
  headersFromExpressRequest,
  registerMcpX402TransportHooks,
  runWithMcpX402Context,
} from "./mcp-x402-transport.js";
import { buildGatewayAuthConfig, createInferenceVirtualKeyClaimsResolver } from "./gateway-auth.js";

/** @deprecated Import from `./gateway-auth.js` instead. */
export { createInferenceVirtualKeyClaimsResolver };

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

/**
 * Same defaults as {@link createMcpExpressApp} from the MCP SDK, but with a higher
 * `express.json()` limit so `execute` can carry base64-encoded PDFs (SDK default is ~100kb).
 */
function createClawqlMcpExpressApp(
  options: {
    host?: string;
    allowedHosts?: string[];
  } = {}
): Express {
  const { host = "127.0.0.1", allowedHosts } = options;
  const app = express();
  const limit = process.env.CLAWQL_MCP_JSON_BODY_LIMIT?.trim() || "32mb";
  app.use(express.json({ limit }));
  if (allowedHosts) {
    app.use(hostHeaderValidation(allowedHosts));
  } else {
    const localhostHosts = ["127.0.0.1", "localhost", "::1"];
    if (localhostHosts.includes(host)) {
      app.use(localhostHostValidation());
    } else if (host === "0.0.0.0" || host === "::") {
      console.warn(
        `[clawql-mcp-http] Server is binding to ${host} without DNS rebinding protection. ` +
          "Consider using allowedHosts to restrict hosts, or use authentication."
      );
    }
  }
  return app;
}

export type CreateMcpHttpAppOptions = {
  /** Override MCP route (default `process.env.MCP_PATH` or `/mcp`). */
  mcpPath?: string;
  /** Express / DNS rebinding host (default `process.env.MCP_HOST` or `0.0.0.0`). */
  host?: string;
  /** Skip spec preload (tests that mock `loadSpec` upstream). */
  skipSpecPreload?: boolean;
  /** Skip mounting in-process `/graphql` (healthz-only HTTP tests). */
  skipGraphqlAttach?: boolean;
  /**
   * Snapshot optional tool flags at app build time (tests). Avoids route registration races when a
   * timed-out test restores `process.env` while the next test is calling `createMcpHttpApp`.
   */
  optionalFlagsSnapshot?: Pick<
    ClawqlOptionalToolFlags,
    | "enableHitlLabelStudio"
    | "enableConeshare"
    | "enableLangfuseEval"
    | "enableDocuments"
    | "enableIdpPipeline"
  >;
  /** Skip MCP OAuth token route (tests). */
  skipMcpOAuth?: boolean;
  /** Inject MCP OAuth runtime (tests). */
  mcpOAuthRuntime?: McpOAuthRuntime;
};

/**
 * Build Express app with `/healthz`, **`/metrics`** (Prometheus when **`CLAWQL_ENABLE_HTTP_METRICS`** is on), and Streamable HTTP MCP on `mcpPath`.
 * Each call uses a fresh session transport map (safe for parallel tests).
 */
export async function createMcpHttpApp(options: CreateMcpHttpAppOptions = {}): Promise<Express> {
  configureHitlTransportDeps();
  registerMcpX402TransportHooks();
  if (!options.skipSpecPreload) {
    await loadSpec();
    await preloadSchemaFieldCacheFromDisk();
    await validateOrDegradeObsidianVaultAtStartup();
  }

  const mcpPath = options.mcpPath?.trim() || process.env.MCP_PATH?.trim() || DEFAULT_MCP_PATH;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const app = createClawqlMcpExpressApp({
    host: options.host || process.env.MCP_HOST || "0.0.0.0",
  });

  app.use(applyCorsIfConfigured);

  app.use("/oauth/token", express.urlencoded({ extended: false }));
  app.use("/oauth/revoke", express.urlencoded({ extended: false }));
  app.use("/oauth/ema", express.json());
  app.use("/oauth/id-jag", express.json());
  app.use("/oauth/passkey", express.json());

  const mcpOAuthRateLimiter = createMcpOAuthRateLimiter();
  app.use("/oauth/token", mcpOAuthRateLimiter);
  app.use("/oauth/revoke", mcpOAuthRateLimiter);
  app.use("/oauth/authorize", mcpOAuthRateLimiter);
  app.use("/oauth/id-jag", mcpOAuthRateLimiter);
  app.use("/oauth/ema", mcpOAuthRateLimiter);
  app.use("/oauth/passkey", mcpOAuthRateLimiter);

  const injectedMcpOAuth = options.mcpOAuthRuntime != null;
  let mcpOAuthRuntime: McpOAuthRuntime | null = options.mcpOAuthRuntime ?? null;
  if (!options.skipMcpOAuth && !mcpOAuthRuntime && Effect.runSync(isMcpOAuthEnabled(process.env))) {
    const { resolveHostAuthEventSink } = await import("./auth-process-worm-sink.js");
    mcpOAuthRuntime = await Effect.runPromise(
      createMcpOAuthFromEnv({ eventSink: resolveHostAuthEventSink(process.env) })
    );
  }

  let idJagIssuer: IdJagIssuerRuntime | null = mcpOAuthRuntime?.idJagIssuer ?? null;
  if (!idJagIssuer && Effect.runSync(isIdJagIssuerEnabled(process.env))) {
    const { resolveHostAuthEventSink } = await import("./auth-process-worm-sink.js");
    idJagIssuer = await Effect.runPromise(
      createIdJagIssuerFromEnv({
        secretStore: resolveSecretStore(),
        eventSink: resolveHostAuthEventSink(process.env),
      })
    );
  }

  /**
   * Gateway auth: `noAuth` | `apiKey` (static + inference VKs) | `oidc` (JWT consumer)
   * | `mcpOAuth` (ClawQL-issued MCP JWT). When MCP OAuth is enabled, Bearer tokens
   * from `/oauth/token` are also accepted in hybrid mode alongside apiKey/oidc.
   */
  const gatewayAuthConfig = buildGatewayAuthConfig(process.env, mcpOAuthRuntime?.validateBearer);

  const resolveEmaAdminClaims = (req: import("express").Request) =>
    resolveAtrClaimsFromHeadersEffect(req.headers, gatewayAuthConfig).pipe(
      Effect.map((claims) => claims),
      Effect.catchAll(() => Effect.succeed(null as AtrClaims | null))
    );

  const emaAdminAuth = {
    adminApiKey: process.env.CLAWQL_API_KEY?.trim(),
    resolveAdminClaims: resolveEmaAdminClaims,
    requiredRole: process.env.CLAWQL_EMA_ADMIN_REQUIRED_ROLE?.trim() || "admin",
  };
  const emaAdminConfigured = Boolean(emaAdminAuth.adminApiKey || mcpOAuthRuntime || idJagIssuer);

  if (mcpOAuthRuntime || idJagIssuer) {
    // createMcpOAuthFromEnv already warns; only re-warn for injected test/runtime hosts.
    if (mcpOAuthRuntime && injectedMcpOAuth) {
      Effect.runSync(warnIfMcpOAuthAuditDisabled(process.env));
      Effect.runSync(warnIfMcpOAuthHs256Only(process.env));
    }
    Effect.runSync(
      warnIfMcpOAuthAdminKeyMissing(process.env, {
        mcpOAuthEnabled: !!mcpOAuthRuntime,
        idJagIssuerEnabled: !!idJagIssuer,
      })
    );
    attachMcpOAuthRoutes(app, mcpOAuthRuntime?.server ?? null, {
      wellKnown: mcpOAuthRuntime
        ? {
            issuer: mcpOAuthRuntime.config.issuer,
            resourceAudience: mcpOAuthRuntime.config.resourceAudience,
          }
        : undefined,
      jwks: mcpOAuthRuntime?.jwks,
      resolveAuthorizeClaims: mcpOAuthRuntime
        ? async (req) =>
            Effect.runPromise(resolveAtrClaimsFromHeadersEffect(req.headers, gatewayAuthConfig))
        : undefined,
      emaAdmin:
        mcpOAuthRuntime && emaAdminConfigured
          ? {
              store: mcpOAuthRuntime.emaStore,
              ...emaAdminAuth,
            }
          : undefined,
      mcpClientsAdmin:
        mcpOAuthRuntime && emaAdminConfigured
          ? {
              registry: mcpOAuthRuntime.clientRegistry,
              ...emaAdminAuth,
            }
          : undefined,
      idJagIssuer: idJagIssuer
        ? {
            service: idJagIssuer.service,
            connectors: idJagIssuer.connectors,
            defaultOrgId: idJagIssuer.material.orgId,
            ...emaAdminAuth,
          }
        : undefined,
    });
  }

  const { attachHostPasskeyRoutes } = await import("./passkey-http-host.js");
  attachHostPasskeyRoutes(app, {
    adminAuth:
      emaAdminAuth.adminApiKey || mcpOAuthRuntime || idJagIssuer ? emaAdminAuth : undefined,
  });

  attachPaymentsWellKnownRoutes(app, { serverName: "ClawQL MCP" });
  // HTMX forms on /credits/* (invite claim / accept / decline)
  app.use("/credits", express.urlencoded({ extended: false }));
  attachCreditsHateoasRoutes(app, { authConfig: gatewayAuthConfig });
  if (isMppOpenApiEnabled(process.env)) {
    attachMppOpenApiRoutes(app, { serverName: "ClawQL MCP" });
  }

  function applyGatewayAuth(
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction
  ): void {
    void (async () => {
      const result = await Effect.runPromise(
        resolveAtrClaimsFromHeadersEffect(req.headers, gatewayAuthConfig).pipe(
          Effect.map((claims) => ({ ok: true, claims }) as const),
          Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.reason } as const))
        )
      );
      if (!result.ok) {
        res.status(401).json({ error: result.error });
        return;
      }
      (req as import("express").Request & { clawqlClaims?: typeof result.claims }).clawqlClaims =
        result.claims;
      next();
    })();
  }

  if (!options.skipGraphqlAttach) {
    await attachGraphqlHttpToMcpApp(app);
  }

  if (httpMetricsEnabledForHttp()) {
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
      vault: getVaultStartupStatus(),
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
          } = await import("clawql-memory/db/memory-db");
          if (memoryDbSyncEnabled()) {
            if (process.env.CLAWQL_MERKLE_ENABLED === "1") {
              base.merkleSnapshot = await loadVaultMerkleSnapshotFromDb(vault);
            }
            if (process.env.CLAWQL_CUCKOO_ENABLED === "1") {
              base.cuckooMembershipArtifactsEnabled = true;
              const { getCuckooMetricsSnapshot } = await import("clawql-core");
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

  const optionalFlags = options.optionalFlagsSnapshot ?? resolvePluginCompositionFlags();

  if (optionalFlags.enableHitlLabelStudio) {
    app.post("/hitl/label-studio/webhook", async (req, res) => {
      try {
        await handleLabelStudioWebhookRequest(req, res);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] POST /hitl/label-studio/webhook error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "internal server error",
          });
        }
      }
    });
  }

  if (optionalFlags.enableConeshare) {
    app.post("/idp/coneshare/webhook", createWebhookRateLimiter(), async (req, res) => {
      try {
        await handleConeshareWebhookRequest(req, res);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] POST /idp/coneshare/webhook error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "internal server error",
          });
        }
      }
    });
  }

  if (optionalFlags.enableDocuments) {
    app.post("/idp/nextcloud/webhook", createWebhookRateLimiter(), async (req, res) => {
      try {
        await handleNextcloudWebhookRequest(req, res);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] POST /idp/nextcloud/webhook error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "internal server error",
          });
        }
      }
    });
  }

  if (optionalFlags.enableIdpPipeline) {
    app.post("/idp/pipeline/run", createWebhookRateLimiter(), async (req, res) => {
      try {
        await handleIdpPipelineRunRequest(req, res);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] POST /idp/pipeline/run error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "internal server error",
          });
        }
      }
    });
  }

  if (optionalFlags.enableLangfuseEval) {
    app.post("/observability/langfuse/webhook", createWebhookRateLimiter(), async (req, res) => {
      try {
        await handleLangfuseEvalWebhookRequest(req, res);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] POST /observability/langfuse/webhook error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            ok: false,
            error: "internal server error",
          });
        }
      }
    });
  }

  app.post(mcpPath, applyGatewayAuth, async (req, res) => {
    const protocolVersion = resolveHttpMcpProtocolVersion(req.header("mcp-protocol-version"));
    res.setHeader("mcp-protocol-version", protocolVersion);

    // MCP 2026-07-28 capability discovery — no session required.
    if (isDiscoverJsonRpc(req.body)) {
      const body = req.body as {
        id?: unknown;
        params?: {
          clientInfo?: { name?: string; version?: string };
          clientCapabilities?: Record<string, unknown>;
        };
      };
      const result = buildHttpDiscoverResponse({
        protocolVersion,
        clientInfo: body.params?.clientInfo,
        clientCapabilities: body.params?.clientCapabilities,
      });
      res.status(200).json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result,
      });
      return;
    }

    const sessionId = req.header("mcp-session-id");
    const useStateless = shouldUseStatelessHttpTransport(protocolVersion);
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (!useStateless && sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
      } else if (useStateless) {
        // Per-request transport — no session affinity (MCP 2026-07-28).
        const streamableJson = ["1", "true", "yes"].includes(
          (process.env.CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE ?? "").trim().toLowerCase()
        );
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: streamableJson,
        });
        const server = createRegisteredMcpServer();
        await server.connect(transport);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const streamableJson = ["1", "true", "yes"].includes(
          (process.env.CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE ?? "").trim().toLowerCase()
        );
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport!);
            // 8.0 session-scope hooks (spec §5) — fire-and-forget; never block init.
            const api = getClawqlApi();
            void fireSessionStart({
              hookRegistry: api.hookRegistry,
              worm: api.worm,
              sessionId: sid,
            }).catch(() => undefined);
          },
          // JSON bodies instead of SSE for each POST — helps some MCP clients / proxies (e.g. Cursor + tight buffering).
          enableJsonResponse: streamableJson,
        });
        transport.onclose = () => {
          const sid = transport!.sessionId;
          if (sid) {
            transports.delete(sid);
            const api = getClawqlApi();
            void fireSessionEnd({
              hookRegistry: api.hookRegistry,
              worm: api.worm,
              sessionId: sid,
            }).catch(() => undefined);
          }
        };

        const server = createRegisteredMcpServer();
        await server.connect(transport);
      } else {
        jsonRpcError(
          res,
          "Bad Request: missing/invalid mcp-session-id, or initialize request required. For MCP 2026-07-28 send mcp-protocol-version: 2026-07-28."
        );
        return;
      }

      if (!transport) {
        jsonRpcError(res, "Bad Request: transport could not be resolved.");
        return;
      }
      await runWithMcpX402Context(headersFromExpressRequest(req), () =>
        transport!.handleRequest(req, res, req.body)
      );
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

  // Explicit discover endpoint (blog / edge clients).
  app.post(`${mcpPath}/discover`, applyGatewayAuth, (req, res) => {
    const protocolVersion = resolveHttpMcpProtocolVersion(
      req.header("mcp-protocol-version") ?? MCP_PROTOCOL_VERSION_2026_07_28
    );
    res.setHeader("mcp-protocol-version", protocolVersion);
    const body = (req.body ?? {}) as {
      clientInfo?: { name?: string; version?: string };
      clientCapabilities?: Record<string, unknown>;
    };
    res.status(200).json(
      buildHttpDiscoverResponse({
        protocolVersion,
        clientInfo: body.clientInfo,
        clientCapabilities: body.clientCapabilities,
      })
    );
  });

  app.get(mcpPath, applyGatewayAuth, async (req, res) => {
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
    await runWithMcpX402Context(headersFromExpressRequest(req), () =>
      transport.handleRequest(req, res)
    );
  });

  app.delete(mcpPath, applyGatewayAuth, async (req, res) => {
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
    await runWithMcpX402Context(headersFromExpressRequest(req), () =>
      transport.handleRequest(req, res)
    );
  });

  return app;
}

async function main() {
  await maybeInitOtelTracing();
  await maybeVerifyReleaseManifestAtStartup();
  registerSpecCacheShutdownHooks();
  registerPostgresPoolShutdownHooks();
  const { ensureClawqlApi, registerClawqlApiShutdownHooks } =
    await import("./clawql-api-adapters.js");
  registerClawqlApiShutdownHooks();
  await ensureClawqlApi();
  const { ensureProcessWormHostBooted } = await import("./process-worm-host.js");
  await ensureProcessWormHostBooted();
  const app = await createMcpHttpApp();
  const { logStartupSummary } = await import("./startup-summary.js");
  await logStartupSummary();
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
