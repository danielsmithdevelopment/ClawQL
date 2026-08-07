import { extractBearerToken } from "./auth.js";
import { createDemoSession, simulateDemoPipeline } from "./demo.js";
import type { GatewayEnv, TenantRow } from "./env.js";
import { isIdpTier } from "./env.js";
import { correlationId, jsonResponse, optionsResponse } from "./http.js";
import { buildIdpProxyInit, resolveIdpProxyOrigin } from "./idp-proxy.js";
import { processStripeEventForTenants, verifyStripeWebhook } from "./stripe-webhook.js";
import { resolveTenantFromRequest } from "./tenants.js";
import {
  listMcpTools,
  runCacheTool,
  runExecute,
  runMemoryIngestTool,
  runMemoryRecallTool,
  runSearch,
  type ToolContext,
} from "./tools.js";

export type { GatewayEnv };

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

async function requireAuthedContext(
  request: Request,
  env: GatewayEnv
): Promise<ToolContext | Response> {
  const corr = correlationId(request);
  const token = extractBearerToken(request);
  const resolved = await resolveTenantFromRequest(env, request, token);
  if ("error" in resolved) {
    return jsonResponse({ error: resolved.error }, resolved.status, {
      "X-Correlation-Id": corr,
    });
  }
  if (isIdpTier(resolved.tenant.tier)) {
    return await idpProxyOrUpgrade(request, env, corr, resolved.tenant);
  }
  return { env, tenant: resolved.tenant, correlationId: corr };
}

async function idpProxyOrUpgrade(
  request: Request,
  env: GatewayEnv,
  corr: string,
  tenant?: TenantRow | null
): Promise<Response> {
  const origin = resolveIdpProxyOrigin(env, tenant);
  if (!origin) {
    return jsonResponse(
      {
        error: "upgrade_required",
        message:
          "IDP tiers require AWS K3s/EKS. Provision idp-k3s or eks profile, set CLAWQL_IDP_PROXY_ORIGIN (or tenant feature_flags.idp_proxy_origin), then retry.",
      },
      503,
      { "X-Correlation-Id": corr }
    );
  }
  const url = new URL(request.url);
  const target = origin + url.pathname + url.search;
  const init = buildIdpProxyInit(request, {
    tenantId: tenant?.tenant_id,
    correlationId: corr,
  });
  const upstream = await fetch(target, init);
  const out = new Headers(upstream.headers);
  out.set("X-Correlation-Id", corr);
  if (tenant?.tenant_id) {
    out.set("X-ClawQL-Tenant-Id", tenant.tenant_id);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

function statusPayload(env: GatewayEnv): Record<string, unknown> {
  return {
    ok: true,
    service: "clawql-gateway",
    profile: env.CLAWQL_GATEWAY_PROFILE ?? "edge",
    time: new Date().toISOString(),
    components: {
      vault: Boolean(env.CLAWQL_VAULT),
      semantic_cache: Boolean(env.CLAWQL_SEMANTIC_CACHE),
      tenants_d1: Boolean(env.CLAWQL_TENANTS),
      queue: Boolean(env.CLAWQL_QUEUE),
      stripe_webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
      idp_proxy: Boolean(env.CLAWQL_IDP_PROXY_ORIGIN),
    },
    policy: {
      mcp_executions: "unlimited",
      worker_side_meter: false,
    },
  };
}

async function handleToolPost(
  name: string,
  ctx: ToolContext,
  body: Record<string, unknown>
): Promise<Response> {
  try {
    let result: unknown;
    switch (name) {
      case "search":
        result = await runSearch(ctx, {
          query: typeof body.query === "string" ? body.query : undefined,
          limit: typeof body.limit === "number" ? body.limit : undefined,
        });
        break;
      case "execute":
        result = await runExecute(ctx, {
          operationId: typeof body.operationId === "string" ? body.operationId : undefined,
          args:
            body.args && typeof body.args === "object"
              ? (body.args as Record<string, unknown>)
              : body,
        });
        break;
      case "memory_ingest":
        result = await runMemoryIngestTool(ctx, body);
        break;
      case "memory_recall":
        result = await runMemoryRecallTool(ctx, body);
        break;
      case "cache":
        result = await runCacheTool(ctx, body);
        break;
      default:
        return jsonResponse({ error: `Unknown tool: ${name}` }, 404, {
          "X-Correlation-Id": ctx.correlationId,
        });
    }
    return jsonResponse(result, 200, { "X-Correlation-Id": ctx.correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 400, {
      "X-Correlation-Id": ctx.correlationId,
    });
  }
}

/** Minimal JSON-RPC MCP surface for tools/list + tools/call (not full Streamable HTTP). */
async function handleMcpJsonRpc(
  request: Request,
  env: GatewayEnv
): Promise<Response> {
  const corr = correlationId(request);
  const body = await readJson(request);
  const id = body.id ?? null;
  const method = typeof body.method === "string" ? body.method : "";

  if (method === "initialize") {
    return jsonResponse(
      {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "clawql-gateway", version: "1.0.0" },
        },
      },
      200,
      { "X-Correlation-Id": corr }
    );
  }
  if (method === "notifications/initialized") {
    return new Response(null, { status: 204 });
  }
  if (method === "tools/list") {
    return jsonResponse(
      { jsonrpc: "2.0", id, result: { tools: listMcpTools() } },
      200,
      { "X-Correlation-Id": corr }
    );
  }
  if (method === "tools/call") {
    const params = (body.params ?? {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
    };
    const ctxOrErr = await requireAuthedContext(request, env);
    if (ctxOrErr instanceof Response) return ctxOrErr;
    const toolName = params.name ?? "";
    const args = params.arguments ?? {};
    try {
      let result: unknown;
      switch (toolName) {
        case "search":
          result = await runSearch(ctxOrErr, args as { query?: string; limit?: number });
          break;
        case "execute":
          result = await runExecute(ctxOrErr, args as { operationId?: string; args?: Record<string, unknown> });
          break;
        case "memory_ingest":
          result = await runMemoryIngestTool(ctxOrErr, args);
          break;
        case "memory_recall":
          result = await runMemoryRecallTool(ctxOrErr, args);
          break;
        case "cache":
          result = await runCacheTool(ctxOrErr, args);
          break;
        default:
          return jsonResponse(
            {
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            },
            200,
            { "X-Correlation-Id": corr }
          );
      }
      return jsonResponse(
        {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          },
        },
        200,
        { "X-Correlation-Id": corr }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse(
        { jsonrpc: "2.0", id, error: { code: -32000, message } },
        200,
        { "X-Correlation-Id": corr }
      );
    }
  }

  return jsonResponse(
    { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } },
    200,
    { "X-Correlation-Id": corr }
  );
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    if (request.method === "OPTIONS") return optionsResponse();

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/healthz" || path === "/health") {
      return jsonResponse({
        ok: true,
        service: "clawql-gateway",
        profile: env.CLAWQL_GATEWAY_PROFILE ?? "edge",
      });
    }

    if (path === "/status") {
      return jsonResponse(statusPayload(env));
    }

    if (path === "/tools" && request.method === "GET") {
      return jsonResponse({ tools: listMcpTools() });
    }

    // Stripe webhooks (no Bearer — signature verified)
    if (path === "/webhooks/stripe" && request.method === "POST") {
      const corr = correlationId(request);
      const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
      const raw = await request.text();
      const sig = request.headers.get("Stripe-Signature") ?? "";
      const verified = await verifyStripeWebhook(raw, sig, secret);
      if (!verified.ok) {
        return jsonResponse({ error: verified.reason }, 400, { "X-Correlation-Id": corr });
      }
      const result = await processStripeEventForTenants(env, verified.event, corr);
      // Never echo apiToken in webhook response logs publicly — include only for operator debugging when present
      return jsonResponse(
        {
          received: true,
          handled: result.handled,
          eventType: result.eventType,
          eventId: result.eventId,
          tenantId: result.tenantId,
          apiTokenMinted: Boolean(result.apiToken),
          // Token returned once so operators / Stripe destination can store it securely.
          ...(result.apiToken ? { apiToken: result.apiToken } : {}),
        },
        200,
        { "X-Correlation-Id": corr }
      );
    }

    // Interactive demo (no signup) — 5-minute sandboxed tenant
    if (path === "/demo/session" && request.method === "POST") {
      try {
        const session = await createDemoSession(env);
        return jsonResponse({
          ...session,
          policy: { ttl_minutes: 5, mcp_executions: "unlimited" },
        });
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : String(err) },
          503
        );
      }
    }

    if (path === "/demo/pipeline" && request.method === "POST") {
      const body = await readJson(request);
      const filename = typeof body.filename === "string" ? body.filename : "document.txt";
      const content = typeof body.content === "string" ? body.content : "";
      if (!content.trim()) {
        return jsonResponse({ error: "content is required" }, 400);
      }
      return jsonResponse(simulateDemoPipeline(filename, content));
    }

    // Explicit IDP path always uses proxy/upgrade (resolve tenant when Bearer present)
    if (path.startsWith("/idp") || url.searchParams.get("tier") === "shared") {
      const corr = correlationId(request);
      const token = extractBearerToken(request);
      let tenant: TenantRow | null = null;
      if (token) {
        const resolved = await resolveTenantFromRequest(env, request, token);
        if (!("error" in resolved)) {
          tenant = resolved.tenant;
        }
      }
      return idpProxyOrUpgrade(request, env, corr, tenant);
    }

    if (path === "/mcp" && request.method === "POST") {
      return handleMcpJsonRpc(request, env);
    }

    // REST tool routes (mcp-api-adapter style)
    const toolMatch = /^\/(search|execute|memory_ingest|memory_recall|cache)$/.exec(path);
    if (toolMatch && request.method === "POST") {
      const ctxOrErr = await requireAuthedContext(request, env);
      if (ctxOrErr instanceof Response) return ctxOrErr;
      const body = await readJson(request);
      return handleToolPost(toolMatch[1]!, ctxOrErr, body);
    }

    return jsonResponse(
      {
        error: "not_found",
        message: "ClawQL edge gateway",
        endpoints: [
          "GET /healthz",
          "GET /status",
          "GET /tools",
          "POST /search|/execute|/memory_ingest|/memory_recall|/cache",
          "POST /mcp",
          "POST /webhooks/stripe",
          "POST /demo/session",
          "POST /demo/pipeline",
        ],
        docs: "docs/deployment/hosted-live-bootstrap.md",
      },
      404
    );
  },
};
