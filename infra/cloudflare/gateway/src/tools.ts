import type { GatewayEnv, TenantRow } from "./env.js";
import { appendAudit, listAudit } from "./audit.js";
import { cacheDelete, cacheGet, cacheSet, semanticCacheLookup } from "./cache.js";
import { findEdgeOperation, searchEdgeOperations } from "./catalog.js";
import { memoryIngest, memoryRecall } from "./vault.js";

export type ToolContext = {
  env: GatewayEnv;
  tenant: TenantRow;
  correlationId: string;
};

async function requireVault(env: GatewayEnv): Promise<R2Bucket> {
  if (!env.CLAWQL_VAULT) throw new Error("R2 vault binding missing");
  return env.CLAWQL_VAULT;
}

async function requireKv(env: GatewayEnv): Promise<KVNamespace> {
  if (!env.CLAWQL_SEMANTIC_CACHE) throw new Error("KV semantic cache binding missing");
  return env.CLAWQL_SEMANTIC_CACHE;
}

async function requireD1(env: GatewayEnv): Promise<D1Database> {
  if (!env.CLAWQL_TENANTS) throw new Error("D1 tenants binding missing");
  return env.CLAWQL_TENANTS;
}

export async function runSearch(
  ctx: ToolContext,
  args: { query?: string; limit?: number }
): Promise<unknown> {
  const results = searchEdgeOperations(args.query ?? "", args.limit ?? 10);
  const db = await requireD1(ctx.env);
  await appendAudit(db, {
    correlationId: ctx.correlationId,
    tenantId: ctx.tenant.tenant_id,
    eventKind: "TOOL_SEARCH",
    summary: `search query=${(args.query ?? "").slice(0, 80)}`,
    payload: { count: results.length },
  });
  return {
    results,
    metering: { mcp_executions: "unlimited", enforced: false },
  };
}

export async function runExecute(
  ctx: ToolContext,
  args: { operationId?: string; args?: Record<string, unknown> }
): Promise<unknown> {
  const operationId = args.operationId?.trim();
  if (!operationId) throw new Error("operationId is required");
  const op = findEdgeOperation(operationId);
  if (!op) {
    throw new Error(
      `Unknown edge operationId: ${operationId}. Use search to list edge ops (full OpenAPI catalog on Node MCP).`
    );
  }
  const callArgs = (args.args ?? {}) as Record<string, unknown>;
  let result: unknown;

  switch (operationId) {
    case "memory.ingest": {
      const vault = await requireVault(ctx.env);
      const db = await requireD1(ctx.env);
      result = await memoryIngest(vault, db, ctx.tenant, {
        title: typeof callArgs.title === "string" ? callArgs.title : undefined,
        content: String(callArgs.content ?? ""),
        slug: typeof callArgs.slug === "string" ? callArgs.slug : undefined,
        tags: Array.isArray(callArgs.tags) ? callArgs.tags.map(String) : undefined,
      });
      break;
    }
    case "memory.recall": {
      const vault = await requireVault(ctx.env);
      const db = await requireD1(ctx.env);
      const query = String(callArgs.query ?? "");
      if (ctx.env.CLAWQL_SEMANTIC_CACHE) {
        const cached = await semanticCacheLookup(
          ctx.env.CLAWQL_SEMANTIC_CACHE,
          ctx.tenant.tenant_id,
          `recall:${query}`
        );
        if (cached.hit) {
          result = { ...(JSON.parse(cached.value) as object), cache: "hit" };
          break;
        }
      }
      const recalled = await memoryRecall(vault, db, ctx.tenant, {
        query,
        limit: typeof callArgs.limit === "number" ? callArgs.limit : undefined,
      });
      if (ctx.env.CLAWQL_SEMANTIC_CACHE) {
        await cacheSet(ctx.env.CLAWQL_SEMANTIC_CACHE, ctx.tenant.tenant_id, {
          key: `recall:${query}`,
          value: JSON.stringify(recalled),
          ttlSeconds: 300,
        });
      }
      result = { ...recalled, cache: "miss" };
      break;
    }
    case "cache.get": {
      const kv = await requireKv(ctx.env);
      result = await cacheGet(kv, ctx.tenant.tenant_id, String(callArgs.key ?? ""));
      break;
    }
    case "cache.set": {
      const kv = await requireKv(ctx.env);
      result = await cacheSet(kv, ctx.tenant.tenant_id, {
        key: String(callArgs.key ?? ""),
        value: String(callArgs.value ?? ""),
        ttlSeconds: typeof callArgs.ttlSeconds === "number" ? callArgs.ttlSeconds : undefined,
      });
      break;
    }
    case "audit.append": {
      const db = await requireD1(ctx.env);
      await appendAudit(db, {
        correlationId: ctx.correlationId,
        tenantId: ctx.tenant.tenant_id,
        eventKind: String(callArgs.eventKind ?? "CUSTOM"),
        summary: typeof callArgs.summary === "string" ? callArgs.summary : undefined,
        model: typeof callArgs.model === "string" ? callArgs.model : undefined,
        payload:
          callArgs.payload && typeof callArgs.payload === "object"
            ? (callArgs.payload as Record<string, unknown>)
            : undefined,
      });
      result = { ok: true };
      break;
    }
    case "audit.list": {
      const db = await requireD1(ctx.env);
      result = {
        events: await listAudit(
          db,
          ctx.tenant.tenant_id,
          typeof callArgs.limit === "number" ? callArgs.limit : 20
        ),
      };
      break;
    }
    case "tenant.get": {
      result = {
        tenant_id: ctx.tenant.tenant_id,
        tier: ctx.tenant.tier,
        r2_prefix: ctx.tenant.r2_prefix,
        status: ctx.tenant.status,
        feature_flags: JSON.parse(ctx.tenant.feature_flags || "{}"),
        unlimited_mcp_executions: true,
      };
      break;
    }
    default:
      throw new Error(`Unhandled operationId: ${operationId}`);
  }

  const db = await requireD1(ctx.env);
  await appendAudit(db, {
    correlationId: ctx.correlationId,
    tenantId: ctx.tenant.tenant_id,
    eventKind: "TOOL_EXECUTE",
    summary: `execute ${operationId}`,
    payload: { operationId },
  });

  // Optional queue fan-out (non-blocking)
  if (ctx.env.CLAWQL_QUEUE) {
    try {
      await ctx.env.CLAWQL_QUEUE.send({
        type: "execute",
        tenant_id: ctx.tenant.tenant_id,
        operationId,
        correlation_id: ctx.correlationId,
        at: new Date().toISOString(),
      });
    } catch {
      /* ignore queue errors in Phase 1 */
    }
  }

  return {
    operationId,
    result,
    metering: { mcp_executions: "unlimited", enforced: false },
  };
}

export async function runMemoryIngestTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<unknown> {
  return runExecute(ctx, { operationId: "memory.ingest", args });
}

export async function runMemoryRecallTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<unknown> {
  return runExecute(ctx, { operationId: "memory.recall", args });
}

export async function runCacheTool(
  ctx: ToolContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const action = String(args.action ?? "get");
  if (action === "set") {
    return runExecute(ctx, { operationId: "cache.set", args });
  }
  if (action === "delete") {
    const kv = await requireKv(ctx.env);
    await cacheDelete(kv, ctx.tenant.tenant_id, String(args.key ?? ""));
    return { ok: true, metering: { mcp_executions: "unlimited", enforced: false } };
  }
  return runExecute(ctx, { operationId: "cache.get", args });
}

/** MCP-style tools/list payload. */
export function listMcpTools(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return [
    {
      name: "search",
      description: "Search edge-native ClawQL operations (vault, cache, audit, tenant).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "execute",
      description:
        "Execute an edge operationId. Unlimited MCP executions — no Worker-side meter.",
      inputSchema: {
        type: "object",
        properties: {
          operationId: { type: "string" },
          args: { type: "object" },
        },
        required: ["operationId"],
      },
    },
    {
      name: "memory_ingest",
      description: "Ingest markdown into the tenant R2 vault prefix.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          slug: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["content"],
      },
    },
    {
      name: "memory_recall",
      description: "Keyword recall from the tenant R2 vault (Layer 5 KV cache when available).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: "cache",
      description: "Layer 5 semantic cache get/set/delete on KV.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["get", "set", "delete"] },
          key: { type: "string" },
          value: { type: "string" },
          ttlSeconds: { type: "number" },
        },
        required: ["key"],
      },
    },
  ];
}
