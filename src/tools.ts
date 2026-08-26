/**
 * tools.ts
 *
 * Core tools: search, execute, then immediately cache + audit (non-negotiable; must not follow optional branches that could throw). audit = in-process ring buffer (#89); cache = in-process LRU KV (#75).
 * Optional: **`sandbox_exec`** via ClawQLInstance `sandbox.enabled` (Kata / Docker / Seatbelt / bridge).
 * Optional: **`data_query` / `data_ingest` / `data_status`** via instance `data.enabled` — Node DuckDB (`clawql-data`).
 * memory_ingest / memory_recall / memory_sync — Obsidian vault notes (`memory.enabled` in instance/tier config).
 * Optional: ingest_external_knowledge — documents tier (`documents.enabled`).
 * Optional: knowledge_search_onyx — `documents.onyx.enabled`.
 * Optional: schedule / notify / workflow — `automation.*` in instance/tier config.
 * Always: ouroboros_* + clawql_think via clawql-harness (GitHub #141); optional CLAWQL_OUROBOROS_DATABASE_URL for Postgres lineage (#142).
 * Plugin enablement: {@link resolvePluginCompositionFlags} / ClawQLInstance — not CLAWQL_ENABLE_*.
 * Single-spec `execute` runs OpenAPI→GraphQL in-process; field resolution uses `graphql-execute-helpers`.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import {
  decodeExecuteInput,
  decodeSearchInput,
  executeToolZodShape,
  ExecuteService,
  getPackageRoot,
  loadSpec,
  resolveBundledProvider,
  SearchService,
  searchToolZodShape,
  cacheToolZodShape,
  auditToolZodShape,
  buildVarArgs,
  buildVarDeclarations,
  capturePathParams,
  discoveryTypeToGraphQL,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
} from "clawql-api";
import { getClawqlApi } from "./clawql-api-adapters.js";
import { resolvePluginCompositionFlags } from "./resolve-plugin-flags.js";
import { defaultFields, executeOutputFields, projectRestByFields } from "./tools-execute-core.js";
import { handleCacheToolInput } from "./clawql-cache.js";
import { handleAuditToolInput } from "./clawql-audit.js";
import {
  configureAutomationPluginDeps,
  handleNotifyToolInput,
  SLACK_NOTIFY_OPERATION_ID,
} from "clawql-automation/plugin";
import {
  configureDocumentsPluginDeps,
  handleKnowledgeSearchOnyxToolInput,
} from "clawql-documents/plugin";
import { configureMemoryOnyxSearch } from "clawql-memory/recall/onyx-recall";
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

/** MCP `search` implementation (exported for tests). Effect Schema is authoritative. */
export async function handleClawqlSearchToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return getClawqlApi().run(
    Effect.gen(function* () {
      const params = yield* decodeSearchInput(raw);
      const search = yield* SearchService;
      const { formattedText } = yield* search.search(params);
      return { content: [{ type: "text" as const, text: formattedText }] };
    })
  );
}

/** MCP `execute` implementation (exported for tests). Effect Schema is authoritative. */
export async function handleClawqlExecuteToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return getClawqlApi().run(
    Effect.gen(function* () {
      const params = yield* decodeExecuteInput(raw);
      const execute = yield* ExecuteService;
      const { content } = yield* execute.execute(params);
      return { content: [...content] };
    })
  );
}

export { SLACK_NOTIFY_OPERATION_ID, handleNotifyToolInput };

configureAutomationPluginDeps({ execute: (params) => handleClawqlExecuteToolInput(params) });
configureDocumentsPluginDeps({
  execute: (params) => handleClawqlExecuteToolInput(params),
  onPipelineHop: async (event) => {
    try {
      const { publishDocumentPipelineHopEvent } =
        await import("clawql-automation/nats/publish-hooks");
      await publishDocumentPipelineHopEvent({
        correlation_id: event.correlation_id,
        hop: {
          index: event.hop.index,
          stage: event.hop.stage,
          operationId: event.hop.operationId,
          ok: event.hop.ok,
          skipped: event.hop.skipped,
          error: event.hop.error,
        },
      });
    } catch {
      /* NATS publish optional */
    }
  },
});
configureMemoryOnyxSearch((params) => handleKnowledgeSearchOnyxToolInput(params));
configureHomeSyncHooks();

/** Register MCP tools declared by composed plugins (Memory, Documents, Automation, Sandbox, Ouroboros, …). */
function registerPluginMcpTools(server: McpServer): void {
  for (const tool of getClawqlApi().listMcpTools()) {
    const handler = wrapRegisteredMcpToolHandler(tool.name, (args) =>
      tool.handler(args).then((result) => ({
        content: result.content.map((c) => ({ type: "text" as const, text: c.text })),
      }))
    );
    if (tool.description) {
      server.tool(tool.name, tool.description, tool.schema, handler);
    } else {
      server.tool(tool.name, tool.schema, handler);
    }
  }
}

export function registerTools(server: McpServer) {
  // Zod shapes are MCP SDK transport-only; Effect Schema decodes inside handlers.
  server.tool(
    "search",
    searchToolZodShape,
    wrapRegisteredMcpToolHandler("search", handleClawqlSearchToolInput)
  );

  server.tool(
    "execute",
    executeToolZodShape,
    wrapRegisteredMcpToolHandler("execute", handleClawqlExecuteToolInput)
  );

  // Non-negotiable Core tools: register immediately after search/execute so optional branches
  // below cannot throw and skip cache/audit (#89 #75).
  server.tool(
    "cache",
    cacheToolZodShape,
    wrapRegisteredMcpToolHandler("cache", handleCacheToolInput)
  );
  server.tool(
    "audit",
    auditToolZodShape,
    wrapRegisteredMcpToolHandler("audit", handleAuditToolInput)
  );

  registerPluginMcpTools(server);

  if (resolvePluginCompositionFlags().enableMemory) {
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
