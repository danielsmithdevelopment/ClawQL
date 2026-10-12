/**
 * Streamable HTTP MCP server implementation. Published entry is `src/server-http.ts`.
 *
 * Exposes MCP on /mcp, health on /healthz, and Prometheus metrics on /metrics (unless disabled).
 */

import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import express, { type Express } from "express";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getDefaultAuditRingBuffer } from "clawql-core";
import { attachGraphqlHttpToMcpApp } from "./graphql-http-attach.js";
import { pruneOrphanJsonStreamMappings } from "./prune-json-stream-mappings.js";
import { createRegisteredMcpServer } from "../mcp/mcp-server-factory.js";
import { runWithMcpRequestContext } from "../mcp/mcp-request-context.js";
import {
  fireSessionEnd,
  fireSessionStart,
  loadSpec,
  registerSpecCacheShutdownHooks,
} from "clawql-api";
import { getClawqlApi } from "../composition/clawql-api-adapters.js";
import { preloadSchemaFieldCacheFromDisk } from "../mcp/tools.js";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import {
  buildHttpDiscoverResponse,
  isDiscoverJsonRpc,
  MCP_PROTOCOL_VERSION_2026_07_28,
  resolveHttpMcpProtocolVersion,
  shouldUseStatelessHttpTransport,
} from "../mcp/mcp-http-protocol.js";
import { chatgptExtensionsDiscoverFragment } from "clawql-chatgpt-extensions";
import {
  handleMcpEventsJsonRpc,
  isMcpEventsEnabledSync,
  isMcpEventsJsonRpc,
  McpEventsServiceLive,
} from "clawql-mcp-events";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import {
  getVaultStartupStatus,
  validateOrDegradeObsidianVaultAtStartup,
} from "../host/vault-config.js";
import { type ClawqlOptionalToolFlags } from "clawql-api";
import { resolvePluginCompositionFlags } from "../composition/resolve-plugin-flags.js";
import { getNativeProtocolMetricsSnapshot, nativeProtocolMetricsEnabled } from "clawql-api";
import { httpMetricsEnabledForHttp, renderPrometheusMetrics } from "clawql-api";
import { maybeInitOtelTracing } from "../observability/otel-tracing.js";

// #region agent log
/** Debug-mode NDJSON probe for Node HTTP multiturn RSS climb (hypotheses A–E). */
let _dbgMcpPostN = 0;
function _dbgAgentLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
): void {
  try {
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
        pid: process.pid,
      })}\n`
    );
  } catch {
    /* ignore probe I/O */
  }
}
function _dbgTransportMaps(transport: StreamableHTTPServerTransport | undefined): {
  stream: number;
  reqToStream: number;
  reqResp: number;
  hasStandaloneSse: boolean;
  enableJson: boolean | null;
} {
  const web = (
    transport as unknown as {
      _webStandardTransport?: {
        _streamMapping?: Map<string, unknown>;
        _requestToStreamMapping?: Map<unknown, unknown>;
        _requestResponseMap?: Map<unknown, unknown>;
        _standaloneSseStreamId?: string;
        _enableJsonResponse?: boolean;
      };
    }
  )?._webStandardTransport;
  if (!web) {
    return {
      stream: -1,
      reqToStream: -1,
      reqResp: -1,
      hasStandaloneSse: false,
      enableJson: null,
    };
  }
  const sid = web._standaloneSseStreamId ?? "_GET_stream";
  return {
    stream: web._streamMapping?.size ?? -1,
    reqToStream: web._requestToStreamMapping?.size ?? -1,
    reqResp: web._requestResponseMap?.size ?? -1,
    hasStandaloneSse: web._streamMapping?.has(sid) ?? false,
    enableJson: web._enableJsonResponse ?? null,
  };
}
function _dbgMem(): { rssMb: number; heapMb: number; extMb: number; arrMb: number } {
  const m = process.memoryUsage();
  const arr = (m as { arrayBuffers?: number }).arrayBuffers ?? 0;
  return {
    rssMb: Number((m.rss / 1048576).toFixed(2)),
    heapMb: Number((m.heapUsed / 1048576).toFixed(2)),
    extMb: Number((m.external / 1048576).toFixed(2)),
    arrMb: Number((arr / 1048576).toFixed(2)),
  };
}
// #endregion
import { maybeVerifyReleaseManifestAtStartup } from "../host/release-manifest-startup.js";
import { handleLabelStudioWebhookRequest } from "clawql-automation/hitl/label-studio";
import { configureHitlTransportDeps } from "./hitl-transport.js";
import { handleConeshareWebhookRequest } from "./webhooks/coneshare-webhook.js";
import { handleNextcloudWebhookRequest } from "./webhooks/nextcloud-webhook.js";
import { handleIdpPipelineRunRequest } from "./idp-pipeline-run-http.js";
import { handleLangfuseEvalWebhookRequest } from "./webhooks/langfuse-eval-webhook.js";
import { createWebhookRateLimiter } from "./webhooks/webhook-rate-limit.js";
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
import { attachCreditsHateoasRoutes, attachProvisioningRoutes } from "clawql-payments";
import { attachPaymentsWellKnownRoutes } from "clawql-payments/discovery";
import { attachMppOpenApiRoutes, isMppOpenApiEnabled } from "clawql-payments/mpp";
import { attachGatewayRegistryRoutes } from "clawql-network";
import {
  headersFromExpressRequest,
  registerMcpX402TransportHooks,
  runWithMcpX402Context,
} from "./mcp-x402-transport.js";
import {
  buildGatewayAuthConfig,
  createInferenceVirtualKeyClaimsResolver,
} from "../composition/gateway-auth.js";

function resolveChatgptDiscoverExtensions(): Record<string, unknown> | undefined {
  if (!resolvePluginCompositionFlags().enableChatgptExtensions) return undefined;
  return chatgptExtensionsDiscoverFragment();
}

/** @deprecated Import from `../composition/gateway-auth.js` instead. */
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
    | "enableObservability"
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
  try {
    const { configureMcpEventsProcessEmitter } = await import("../mcp/mcp-events-host.js");
    configureMcpEventsProcessEmitter();
  } catch {
    /* mcp-events optional in slim test hosts */
  }
  if (!options.skipSpecPreload) {
    await loadSpec();
    await preloadSchemaFieldCacheFromDisk();
    const { resolvePluginCompositionFlags } = await import("../composition/resolve-plugin-flags.js");
    if (resolvePluginCompositionFlags().enableMemory) {
      await validateOrDegradeObsidianVaultAtStartup();
    }
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
    const { resolveHostAuthEventSink } = await import("../composition/auth-process-worm-sink.js");
    mcpOAuthRuntime = await Effect.runPromise(
      createMcpOAuthFromEnv({ eventSink: resolveHostAuthEventSink(process.env) })
    );
  }

  let idJagIssuer: IdJagIssuerRuntime | null = mcpOAuthRuntime?.idJagIssuer ?? null;
  if (!idJagIssuer && Effect.runSync(isIdJagIssuerEnabled(process.env))) {
    const { resolveHostAuthEventSink } = await import("../composition/auth-process-worm-sink.js");
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
      Effect.catch(() => Effect.succeed(null as AtrClaims | null))
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
      grantAdmin:
        mcpOAuthRuntime && emaAdminConfigured && mcpOAuthRuntime.config.grantKeyStore != null
          ? { ...emaAdminAuth }
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
  // Gap A gateway registry HTTP (Bearer CLAWQL_NETWORK_REGISTRY_TOKEN or PUBLIC=1)
  attachGatewayRegistryRoutes(app, {
    env: process.env,
    home: process.env.CLAWQL_HOME?.trim(),
  });
  // CPC internal provision / usage (Bearer CLAWQL_CPC_PROVISION_TOKEN; 503 if unset)
  attachProvisioningRoutes(app);
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
          Effect.catch((err) => Effect.succeed({ ok: false, error: err.reason } as const))
        )
      );
      if (!result.ok) {
        // MCP OAuth discovery challenge (RFC 9728): clients follow resource_metadata
        // to the protected-resource doc on this MCP origin.
        if (mcpOAuthRuntime) {
          const { buildMcpWwwAuthenticateHeaderEffect, resolvePublicOriginEffect } =
            await import("clawql-auth");
          const origin = await Effect.runPromise(
            resolvePublicOriginEffect({
              proto: req.get("x-forwarded-proto") ?? req.protocol,
              host: req.get("host") ?? "localhost",
            })
          );
          const wwwAuth = await Effect.runPromise(
            buildMcpWwwAuthenticateHeaderEffect({
              resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
              error: "invalid_token",
              errorDescription: result.error,
            })
          );
          res.setHeader("WWW-Authenticate", wwwAuth);
        }
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

  if (optionalFlags.enableObservability) {
    const { attachObservabilityHttpRoutes } = await import("clawql-observability/http");
    attachObservabilityHttpRoutes(app, process.env);
  }

  // WebMCP draft bound execute — browser publish scripts POST here (§6).
  app.post("/webmcp-draft/bound-execute", applyGatewayAuth, async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        toolName?: string;
        args?: Record<string, unknown>;
        bindings?: import("clawql-core").BoundOperation[];
        versionId?: string;
      };
      const toolName = String(body.toolName ?? "");
      if (!toolName) {
        res.status(400).json({ ok: false, error: "toolName required" });
        return;
      }
      const { Effect, Layer } = await import("effect");
      const {
        BoundOperationInvokerHostLive,
        DraftStoreLive,
        DraftStoreService,
        executeBoundOperation,
        findBinding,
      } = await import("clawql-core");
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          let binding = body.bindings ? findBinding(body.bindings, toolName) : undefined;
          if (!binding) {
            const store = yield* DraftStoreService;
            const version = body.versionId
              ? yield* store.getVersion(String(body.versionId))
              : yield* store.getActiveVersion();
            if (!version) {
              return yield* Effect.fail(new Error("no active published WebMCP version"));
            }
            binding = findBinding(version.bindings, toolName);
          }
          if (!binding) {
            return yield* Effect.fail(new Error(`no binding for tool ${toolName}`));
          }
          return yield* executeBoundOperation(binding, body.args ?? {});
        }).pipe(Effect.provide(Layer.mergeAll(DraftStoreLive, BoundOperationInvokerHostLive)))
      );
      res.status(200).json(result);
    } catch (err: unknown) {
      console.error("[clawql-mcp-http] POST /webmcp-draft/bound-execute error:", err);
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(400).json({ ok: false, error: message });
      }
    }
  });

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
        extensions: resolveChatgptDiscoverExtensions(),
      });
      res.status(200).json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result,
      });
      return;
    }

    // MCP Events (ChatGPT / draft Events spec) — same authenticated endpoint as tools.
    if (isMcpEventsJsonRpc(req.body)) {
      if (!isMcpEventsEnabledSync()) {
        const body = req.body as { id?: unknown };
        res.status(200).json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32601, message: "MCP Events disabled (CLAWQL_ENABLE_MCP_EVENTS=0)" },
        });
        return;
      }
      const body = req.body as {
        id?: unknown;
        method?: string;
        params?: unknown;
      };
      const principal =
        (typeof req.header("x-clawql-principal") === "string" &&
          req.header("x-clawql-principal")?.trim()) ||
        (typeof req.header("x-clawql-atr-sub") === "string" &&
          req.header("x-clawql-atr-sub")?.trim()) ||
        "anonymous";
      try {
        const rpc = await Effect.runPromise(
          handleMcpEventsJsonRpc(
            { jsonrpc: "2.0", id: body.id, method: body.method, params: body.params },
            principal
          ).pipe(Effect.provide(McpEventsServiceLive))
        );
        res.status(200).json(rpc);
      } catch (err: unknown) {
        console.error("[clawql-mcp-http] MCP Events error:", err);
        res.status(200).json({
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : "Internal error",
          },
        });
      }
      return;
    }

    const sessionId = req.header("mcp-session-id");
    const useStateless = shouldUseStatelessHttpTransport(protocolVersion);
    /** Close after request — required for per-request (stateless) transports so they do not accumulate. */
    let closeTransportAfter = false;
    // #region agent log
    let _dbgBranch: "session_reuse" | "stateless" | "initialize" | "reject" | "none" = "none";
    const _dbgPostN = ++_dbgMcpPostN;
    // #endregion
    try {
      let transport: StreamableHTTPServerTransport | undefined;

      if (!useStateless && sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId);
        // #region agent log
        _dbgBranch = "session_reuse";
        // #endregion
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
        closeTransportAfter = true;
        // #region agent log
        _dbgBranch = "stateless";
        // #endregion
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
            // #region agent log
            _dbgAgentLog("D", "mcp-http-server.ts:onsessioninitialized", "session start hook", {
              sidLen: sid.length,
              transportsSize: transports.size,
            });
            // #endregion
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
            // #region agent log
            _dbgAgentLog("D", "mcp-http-server.ts:onclose", "session end hook", {
              sidLen: typeof sid === "string" ? sid.length : 0,
              transportsSize: transports.size,
            });
            // #endregion
            void fireSessionEnd({
              hookRegistry: api.hookRegistry,
              worm: api.worm,
              sessionId: sid,
            }).catch(() => undefined);
          }
        };

        const server = createRegisteredMcpServer();
        await server.connect(transport);
        // #region agent log
        _dbgBranch = "initialize";
        // #endregion
      } else {
        // #region agent log
        _dbgBranch = "reject";
        // #endregion
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
      const atrToolsHeader = req.header("x-clawql-capability-tools")?.trim();
      const atrScopeTokens = atrToolsHeader
        ? atrToolsHeader
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;
      const mcpSession =
        sessionId ??
        (typeof transport.sessionId === "string" ? transport.sessionId : undefined) ??
        "mcp";
      // #region agent log
      const _dbgMapsBefore = _dbgTransportMaps(transport);
      // #endregion
      try {
        await runWithMcpX402Context(headersFromExpressRequest(req), () =>
          runWithMcpRequestContext({ sessionId: mcpSession, atrScopeTokens }, () =>
            transport!.handleRequest(req, res, req.body)
          )
        );
      } finally {
        // SDK JSON-response mode leaves `_streamMapping` entries after resolveJson;
        // prune orphans so sessionful multiturn does not retain one entry per POST.
        const prunedJsonStreams = closeTransportAfter
          ? 0
          : pruneOrphanJsonStreamMappings(transport);
        // #region agent log
        // Sample: first 5, then every 25th — enough for climb curve without huge logs.
        if (_dbgPostN <= 5 || _dbgPostN % 25 === 0) {
          let auditTotal = -1;
          try {
            auditTotal = getDefaultAuditRingBuffer().list(1).total;
          } catch {
            auditTotal = -1;
          }
          const mapsAfter = _dbgTransportMaps(transport);
          _dbgAgentLog("A", "mcp-http-server.ts:post-finally", "post /mcp maps+mem", {
            n: _dbgPostN,
            branch: _dbgBranch,
            useStateless,
            closeTransportAfter,
            transportsSize: transports.size,
            mapsBefore: _dbgMapsBefore,
            mapsAfter,
            prunedJsonStreams,
            mem: _dbgMem(),
            auditTotal,
            bodyBytes: Buffer.byteLength(JSON.stringify(req.body ?? null)),
            headersSent: res.headersSent,
            statusCode: res.statusCode,
            runId: "post-fix",
          });
          // Hypotheses B (audit) + C (express status) share this sample; E = req maps non-zero after.
          if (mapsAfter.reqToStream > 0 || mapsAfter.reqResp > 0) {
            _dbgAgentLog("E", "mcp-http-server.ts:post-finally", "orphan request maps after handle", {
              n: _dbgPostN,
              mapsAfter,
              runId: "post-fix",
            });
          }
          if (mapsAfter.stream > (mapsAfter.hasStandaloneSse ? 1 : 0)) {
            _dbgAgentLog("A", "mcp-http-server.ts:post-finally", "streamMapping grew (json mode leak?)", {
              n: _dbgPostN,
              streamSize: mapsAfter.stream,
              hasStandaloneSse: mapsAfter.hasStandaloneSse,
              enableJson: mapsAfter.enableJson,
              prunedJsonStreams,
              runId: "post-fix",
            });
          } else {
            _dbgAgentLog("A", "mcp-http-server.ts:post-finally", "streamMapping stable after prune", {
              n: _dbgPostN,
              streamSize: mapsAfter.stream,
              prunedJsonStreams,
              runId: "post-fix",
            });
          }
        }
        // #endregion
        if (closeTransportAfter) {
          await transport.close().catch(() => undefined);
        }
      }
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
        extensions: resolveChatgptDiscoverExtensions(),
      })
    );
  });

  app.get(mcpPath, applyGatewayAuth, async (req, res) => {
    // Opt-in for long-lived benches / JSON-response clients: refuse standalone SSE GET
    // so the SDK client skips the GET stream (405) and does not retain SSE buffers.
    // Default remains SSE-capable for IDE notifications.
    if (
      ["1", "true", "yes"].includes(
        (process.env.CLAWQL_MCP_DISABLE_STANDALONE_SSE ?? "").trim().toLowerCase()
      )
    ) {
      // #region agent log
      _dbgAgentLog("C", "mcp-http-server.ts:get-sse-disabled", "GET /mcp refused (standalone SSE off)", {
        mem: _dbgMem(),
        transportsSize: transports.size,
      });
      // #endregion
      res.status(405).setHeader("Allow", "POST, DELETE").end();
      return;
    }
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
      runWithMcpRequestContext({ sessionId }, () => transport.handleRequest(req, res))
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
      runWithMcpRequestContext({ sessionId }, () => transport.handleRequest(req, res))
    );
  });

  return app;
}

export async function startMcpHttpServer(): Promise<void> {
  await maybeInitOtelTracing();
  await maybeVerifyReleaseManifestAtStartup();
  registerSpecCacheShutdownHooks();
  const { resolvePluginCompositionFlags } = await import("../composition/resolve-plugin-flags.js");
  if (resolvePluginCompositionFlags().enableMemory) {
    const { registerPostgresPoolShutdownHooks } = await import("clawql-memory/vector/pgvector");
    registerPostgresPoolShutdownHooks();
  }
  const { ensureClawqlApi, registerClawqlApiShutdownHooks } =
    await import("../composition/clawql-api-adapters.js");
  registerClawqlApiShutdownHooks();
  await ensureClawqlApi();
  const { wireOptionalToolDeps } = await import("../mcp/tools.js");
  await wireOptionalToolDeps();
  const { configureMcpEventsProcessEmitter } = await import("../mcp/mcp-events-host.js");
  configureMcpEventsProcessEmitter();
  const { ensureProcessWormHostBooted } = await import("../composition/process-worm-host.js");
  await ensureProcessWormHostBooted();
  const app = await createMcpHttpApp();
  const { logStartupSummary } = await import("../host/startup-summary.js");
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
