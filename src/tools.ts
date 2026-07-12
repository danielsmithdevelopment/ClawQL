/**
 * tools.ts
 *
 * Core tools: search, execute, then immediately cache + audit (non-negotiable; must not follow optional branches that could throw). audit = in-process ring buffer (#89); cache = in-process LRU KV (#75).
 * Optional: **`sandbox_exec`** when **`CLAWQL_ENABLE_SANDBOX=1`** — Kata (default in-cluster), Docker, Seatbelt, Cloudflare bridge (`CLAWQL_SANDBOX_BACKEND`).
 * memory_ingest / memory_recall / memory_sync — Obsidian vault notes (default on; set CLAWQL_ENABLE_MEMORY=0 to hide; writable vault). memory_sync requires team bucket config (CLAWQL_SYNC_*).
 * Optional: ingest_external_knowledge — bulk Markdown + optional URL fetch (GitHub #40); default on; **`CLAWQL_ENABLE_DOCUMENTS=0`** to hide.
 * Optional: knowledge_search_onyx — Onyx when CLAWQL_ENABLE_ONYX and documents enabled; **`CLAWQL_ENABLE_DOCUMENTS=0`** hides (GitHub #118).
 * Optional: schedule — persisted jobs + manual synthetic trigger when CLAWQL_ENABLE_SCHEDULE (GitHub #76).
 * Optional: notify — Slack chat.postMessage when CLAWQL_ENABLE_NOTIFY (GitHub #77); requires Slack in loaded spec + bot token.
 * Optional: hitl_enqueue_label_studio — Label Studio review queue when CLAWQL_ENABLE_HITL_LABEL_STUDIO (GitHub #228); registered via AutomationPlugin.
 * Optional: ouroboros_* — evolutionary loop tools when CLAWQL_ENABLE_OUROBOROS (GitHub #141); optional CLAWQL_OUROBOROS_DATABASE_URL for Postgres lineage (#142).
 * Single-spec `execute` runs OpenAPI→GraphQL in-process; field resolution uses `graphql-execute-helpers`.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { ExecuteService, SearchService } from "clawql-api";
import { getClawqlOptionalToolFlags } from "clawql-api";
import { z } from "zod";
import { getClawqlApi, runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { getPackageRoot } from "clawql-api";
import { resolveBundledProvider } from "clawql-api";
import {
  buildVarArgs,
  buildVarDeclarations,
  capturePathParams,
  discoveryTypeToGraphQL,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
} from "clawql-api";
import { loadSpec } from "clawql-api";
import { defaultFields, executeOutputFields, projectRestByFields } from "./tools-execute-core.js";
import { cacheToolSchema, handleCacheToolInput } from "./clawql-cache.js";
import { auditToolSchema, handleAuditToolInput } from "./clawql-audit.js";
import {
  configureAutomationPluginDeps,
  handleNotifyToolInput,
  SLACK_NOTIFY_OPERATION_ID,
} from "clawql-automation/plugin";
import { configureDocumentsPluginDeps } from "clawql-documents/plugin";
import { wrapRegisteredMcpToolHandler } from "./mcp-tool-wrap.js";
import { configureHomeSyncHooks } from "./configure-home-sync.js";
import { handleMemorySyncToolInput, memorySyncToolSchema } from "./home-sync/memory-sync.js";

export { executeOutputFields, projectRestByFields } from "./tools-execute-core.js";

type GraphQLFieldInfo = { name: string; args: string[] };

/**
 * On startup: log whether pregenerated GraphQL introspection exists on disk (optional).
 * Returns whether a file was found (for smoke scripts and diagnostics).
 */
export async function preloadSchemaFieldCacheFromDisk(): Promise<boolean> {
  const spec = await loadSpec();
  if (spec.multi) {
    console.error(
      "[tools] Multi-spec mode: skipping GraphQL introspection cache (OpenAPI execute uses REST when CLAWQL_GRAPHQL_SOURCES is unset)."
    );
    return false;
  }
  const parsed = await tryLoadIntrospectionFromDisk();
  if (!parsed) return false;
  return true;
}

/** @deprecated No-op; retained for test compatibility. */
export function resetSchemaFieldCache(): void {}

/** MCP `search` implementation (exported for tests). */
export async function handleClawqlSearchToolInput(params: {
  query: string;
  limit: number;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  await runMcpProxyBeforeCallTool("search", params);
  return getClawqlApi().run(
    Effect.gen(function* () {
      const search = yield* SearchService;
      const { formattedText } = yield* search.search(params);
      return { content: [{ type: "text" as const, text: formattedText }] };
    })
  );
}

/** MCP `execute` implementation (exported for tests). */
export async function handleClawqlExecuteToolInput(params: {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
}): Promise<{ content: { type: "text"; text: string }[] }> {
  await runMcpProxyBeforeCallTool("execute", params);
  return getClawqlApi().run(
    Effect.gen(function* () {
      const execute = yield* ExecuteService;
      const { content } = yield* execute.execute(params);
      return { content: [...content] };
    })
  );
}

export { SLACK_NOTIFY_OPERATION_ID, handleNotifyToolInput };

configureAutomationPluginDeps({ execute: (params) => handleClawqlExecuteToolInput(params) });
configureDocumentsPluginDeps({ execute: (params) => handleClawqlExecuteToolInput(params) });
configureHomeSyncHooks();

/** Register MCP tools declared by composed plugins (Memory, Documents, Automation, Sandbox, Ouroboros, …). */
function registerPluginMcpTools(server: McpServer): void {
  for (const tool of getClawqlApi().listMcpTools()) {
    server.tool(
      tool.name,
      tool.schema,
      wrapRegisteredMcpToolHandler(tool.name, (args) =>
        tool.handler(args).then((result) => ({
          content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
        }))
      )
    );
  }
}

export function registerTools(server: McpServer) {
  server.tool(
    "search",
    {
      query: z
        .string()
        .describe(
          "Natural language description of what you want to do. " +
            "E.g. 'list services in a region', 'delete a revision', " +
            "'get IAM policy for a job', 'cancel a running execution'."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("Max number of matching operations to return."),
    },
    wrapRegisteredMcpToolHandler("search", handleClawqlSearchToolInput)
  );

  server.tool(
    "execute",
    {
      operationId: z
        .string()
        .describe(
          "The operation ID from search() results. " +
            "E.g. 'run.projects.locations.services.list'. " +
            "For large binary bodies (e.g. PDF → Tika `application/octet-stream`), prefer the MCP gRPC surface " +
            "(`model_context_protocol.Mcp/CallTool` on the chart gRPC port, default 50051) instead of Streamable HTTP JSON."
        ),
      args: z
        .record(z.string(), z.unknown())
        .describe(
          "Key/value map of parameters for the operation (path + query + body). " +
            'For `application/octet-stream`, pass `body` (+ optional `bodyEncoding: "base64"`, `bodyContentType`). ' +
            "Very large `body` strings should use gRPC CallTool (see operationId note), not HTTP MCP."
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional response fields to return. Fewer fields = smaller context window usage. " +
            "Omit to get a sensible default. E.g. ['name', 'uri', 'latestReadyRevision']"
        ),
    },
    wrapRegisteredMcpToolHandler("execute", handleClawqlExecuteToolInput)
  );

  // Non-negotiable Core tools: register immediately after search/execute so optional branches
  // below cannot throw and skip cache/audit (#89 #75).
  server.tool(
    "cache",
    cacheToolSchema,
    wrapRegisteredMcpToolHandler("cache", handleCacheToolInput)
  );
  server.tool(
    "audit",
    auditToolSchema,
    wrapRegisteredMcpToolHandler("audit", handleAuditToolInput)
  );

  registerPluginMcpTools(server);

  if (getClawqlOptionalToolFlags().enableMemory) {
    server.tool(
      "memory_sync",
      memorySyncToolSchema,
      wrapRegisteredMcpToolHandler("memory_sync", handleMemorySyncToolInput)
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function resolveIntrospectionFilePath(): string | null {
  const explicit = process.env.CLAWQL_INTROSPECTION_PATH?.trim();
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolvePath(process.cwd(), explicit);
  }
  const prov = process.env.CLAWQL_PROVIDER?.trim();
  if (prov) {
    const p = resolveBundledProvider(prov);
    if (p && "bundledIntrospectionPath" in p && p.bundledIntrospectionPath) {
      return resolvePath(getPackageRoot(), p.bundledIntrospectionPath);
    }
  }
  return null;
}

async function tryLoadIntrospectionFromDisk(): Promise<{
  query: GraphQLFieldInfo[];
  mutation: GraphQLFieldInfo[];
} | null> {
  const introPath = resolveIntrospectionFilePath();
  if (!introPath) return null;
  try {
    const text = await readFile(introPath, "utf-8");
    const data = JSON.parse(text) as {
      __schema: {
        queryType: {
          fields: Array<{ name: string; args: Array<{ name: string }> }>;
        };
        mutationType: {
          fields: Array<{ name: string; args: Array<{ name: string }> }>;
        } | null;
      };
    };
    console.error(`[tools] Using pregenerated GraphQL introspection (disk): ${introPath}`);
    return {
      query: data.__schema.queryType.fields.map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
      mutation: (data.__schema.mutationType?.fields ?? []).map((f) => ({
        name: f.name,
        args: f.args.map((a) => a.name),
      })),
    };
  } catch {
    return null;
  }
}

// Narrow test surface for critical path helper behavior.
export const __testUtils = {
  operationIdToGraphQLName,
  operationIdToRunStyleName,
  normalizeArgsForField,
  capturePathParams,
  buildVarDeclarations,
  buildVarArgs,
  discoveryTypeToGraphQL,
  defaultFields,
  projectRestByFields,
  executeOutputFields,
};
