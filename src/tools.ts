/**
 * tools.ts
 *
 * Core tools: search (spec discovery) and execute (GraphQL-backed REST call).
 * Optional: sandbox_exec — remote execution via cloudflare/sandbox-bridge Worker.
 * Optional: memory_ingest / memory_recall — Obsidian vault notes (ingest + recall).
 * Optional: ingest_external_knowledge — bulk Markdown + optional URL fetch (GitHub #40).
 * Optional: cache — in-process ephemeral KV when CLAWQL_ENABLE_CACHE (GitHub #75); not persisted — use memory_* for vault.
 * Optional: audit — in-process ring buffer when CLAWQL_ENABLE_AUDIT (GitHub #89); not durable — use memory_ingest for compliance trails.
 * Single-spec `execute` runs OpenAPI→GraphQL in-process; field resolution uses `graphql-execute-helpers`.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPackageRoot } from "./package-root.js";
import { resolveBundledProvider } from "./provider-registry.js";
import {
  buildVarArgs,
  buildVarDeclarations,
  capturePathParams,
  discoveryTypeToGraphQL,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
} from "./graphql-execute-helpers.js";
import { executeOperationGraphQL } from "./graphql-in-process-execute.js";
import { loadSpec, resolveApiBaseUrlForOperation } from "./spec-loader.js";
import { searchOperations, formatSearchResults } from "./spec-search.js";
import { executeRestOperation } from "./rest-operation.js";
import { handleClawqlCodeToolInput } from "./sandbox-bridge-client.js";
import { handleIngestExternalKnowledgeToolInput } from "./external-ingest.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { handleMemoryRecallToolInput } from "./memory-recall.js";
import { cacheToolSchema, handleCacheToolInput } from "./clawql-cache.js";
import { auditToolSchema, handleAuditToolInput } from "./clawql-audit.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import type { OpenAPIDoc } from "./spec-loader.js";

type GraphQLFieldInfo = { name: string; args: string[] };

/**
 * REST execute paths (multi-spec or GraphQL→REST fallback) return the full HTTP JSON body.
 * When the caller passed `fields`, keep only those top-level keys so behavior aligns with
 * the GraphQL selection set (nested GraphQL fragments are not parsed—list top-level names).
 */
export function projectRestByFields(data: unknown, fields: string[] | undefined): unknown {
  if (!fields?.length) return data;
  const pick = (item: unknown): unknown => {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      const obj = item as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(obj, f)) out[f] = obj[f];
      }
      return out;
    }
    return item;
  };
  if (Array.isArray(data)) return data.map(pick);
  return pick(data);
}

/**
 * When `execute` omits `fields`, use these for GitHub pull mutations/get: GraphQL selection
 * plus a final top-level pick. The Mesh/OpenAPI layer often returns the full REST JSON even
 * when the document asks for scalars only.
 */
function defaultExecuteOutputFields(operationId: string): string[] | undefined {
  switch (operationId) {
    case "pulls/create":
    case "pulls/update":
    case "pulls/get":
      return ["html_url", "number", "title", "state", "url"];
    default:
      return undefined;
  }
}

/** Effective field list for GraphQL selection and post-response projection. */
export function executeOutputFields(
  operationId: string,
  fields: string[] | undefined
): string[] | undefined {
  if (fields && fields.length > 0) return fields;
  return defaultExecuteOutputFields(operationId);
}

/**
 * On startup: log whether pregenerated GraphQL introspection exists on disk (optional).
 * Returns whether a file was found (for smoke scripts and diagnostics).
 */
export async function preloadSchemaFieldCacheFromDisk(): Promise<boolean> {
  const spec = await loadSpec();
  if (spec.multi) {
    console.error(
      "[tools] Multi-spec mode: skipping GraphQL introspection cache (execute uses REST)."
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
  const { operations } = await loadSpec();
  const results = searchOperations(operations, params.query, params.limit);
  return {
    content: [{ type: "text", text: formatSearchResults(results) }],
  };
}

/** MCP `execute` implementation (exported for tests). */
export async function handleClawqlExecuteToolInput(params: {
  operationId: string;
  args: Record<string, unknown>;
  fields?: string[];
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const { operationId, args, fields } = params;
  const loaded = await loadSpec();
  const { operations, openapi, openapis, multi } = loaded;
  const op = operations.find((o) => o.id === operationId);

  if (!op) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Unknown operationId: "${operationId}". Use search() to find valid operation IDs.`,
          }),
        },
      ],
    };
  }

  const openapiForOp = multi && openapis?.length ? openapis[op.specIndex ?? 0] : openapi;

  const outputFields = executeOutputFields(operationId, fields);

  if (multi) {
    const fallback = await executeRestOperation(op, args, openapiForOp);
    if (!fallback.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: fallback.error,
              specLabel: op.specLabel ?? null,
              hint: "Multi-spec mode uses REST only (no GraphQL). Check path/query/body args.",
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2),
        },
      ],
    };
  }

  try {
    const selectedFields = outputFields?.length
      ? outputFields.join("\n        ")
      : defaultFields(operationId);

    const baseUrl = resolveApiBaseUrlForOperation(openapiForOp as OpenAPIDoc, op);
    const inProc = await executeOperationGraphQL(
      openapiForOp as OpenAPIDoc,
      baseUrl,
      op,
      args,
      selectedFields
    );
    if (!inProc.ok) {
      throw new Error(inProc.error);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projectRestByFields(inProc.data, outputFields), null, 2),
        },
      ],
    };
  } catch (err: unknown) {
    const fallback = await executeRestOperation(op, args, openapiForOp);
    if (!fallback.ok) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: reason,
              fallbackError: fallback.error,
              hint: "GraphQL execution failed and REST fallback also failed.",
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projectRestByFields(fallback.data, outputFields), null, 2),
        },
      ],
    };
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
    handleClawqlSearchToolInput
  );

  server.tool(
    "execute",
    {
      operationId: z
        .string()
        .describe(
          "The operation ID from search() results. " +
            "E.g. 'run.projects.locations.services.list'."
        ),
      args: z
        .record(z.string(), z.unknown())
        .describe(
          "Key/value map of parameters for the operation (path + query params). " +
            "E.g. { parent: 'projects/my-proj/locations/us-central1', pageSize: 10 }"
        ),
      fields: z
        .array(z.string())
        .optional()
        .describe(
          "Optional response fields to return. Fewer fields = smaller context window usage. " +
            "Omit to get a sensible default. E.g. ['name', 'uri', 'latestReadyRevision']"
        ),
    },
    handleClawqlExecuteToolInput
  );

  const sandboxCodeSchema = {
    code: z
      .string()
      .describe(
        "Source code to run in an isolated Cloudflare Sandbox (via deployed bridge Worker)."
      ),
    language: z
      .enum(["python", "javascript", "shell"])
      .describe("python (python3), javascript (Node .mjs), or shell (posix sh script body)."),
    sessionId: z
      .string()
      .optional()
      .describe(
        "When persistenceMode is session or persistent, reuse the same id to keep a stable sandbox filesystem (e.g. persist files across calls)."
      ),
    persistenceMode: z
      .enum(["ephemeral", "session", "persistent"])
      .optional()
      .describe(
        "Overrides CLAWQL_SANDBOX_PERSISTENCE_MODE. ephemeral = new sandbox each call; session = per sessionId; persistent = one shared sandbox."
      ),
    timeoutMs: z
      .number()
      .int()
      .min(1000)
      .optional()
      .describe("Optional wall-clock limit in ms (capped by CLAWQL_SANDBOX_TIMEOUT_MS_MAX)."),
  };

  server.tool("sandbox_exec", sandboxCodeSchema, handleClawqlCodeToolInput);

  server.tool(
    "memory_ingest",
    {
      title: z
        .string()
        .min(1)
        .describe("Suggested Obsidian page title (used for the file name and heading)."),
      insights: z.string().optional().describe("Key insights to persist."),
      conversation: z.string().optional().describe("Conversation transcript or summary text."),
      toolOutputs: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Tool result body, or a list of results to record."),
      toolOutputsFile: z
        .string()
        .optional()
        .describe(
          "If set, the ClawQL server reads UTF-8 from this file path and uses it as `toolOutputs` (small MCP payload; " +
            "large content does not go through the tool round-trip). File must be under an allowed root " +
            "(`CLAWQL_MEMORY_INGEST_FILE_ROOTS` or, by default, the process current working directory). " +
            "Takes precedence over `toolOutputs` if both are set. Set `CLAWQL_MEMORY_INGEST_FILE=0` to reject."
        ),
      wikilinks: z
        .array(z.string())
        .optional()
        .describe(
          "Other vault page names to link with Obsidian [[wikilinks]] (plain names; brackets optional)."
        ),
      sessionId: z.string().optional().describe("Optional session label (shown in the note)."),
      append: z
        .boolean()
        .optional()
        .describe(
          "When the page already exists, append a new section (default true). Set false to replace the file."
        ),
    },
    handleMemoryIngestToolInput
  );

  server.tool(
    "memory_recall",
    {
      query: z
        .string()
        .min(1)
        .describe(
          "Natural language or keywords to find in vault Markdown (filename + body + headings)."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max notes to return (default: CLAWQL_MEMORY_RECALL_LIMIT or 10)."),
      maxDepth: z
        .number()
        .int()
        .min(0)
        .max(10)
        .optional()
        .describe(
          "How many wikilink hops to follow from keyword hits (default: CLAWQL_MEMORY_RECALL_MAX_DEPTH or 2)."
        ),
      minScore: z
        .number()
        .min(0)
        .optional()
        .describe(
          "Minimum keyword match score to seed a note (default: CLAWQL_MEMORY_RECALL_MIN_SCORE or 1)."
        ),
    },
    handleMemoryRecallToolInput
  );

  server.tool(
    "ingest_external_knowledge",
    {
      source: z
        .string()
        .optional()
        .describe(
          'Importer: "markdown" (default when documents[] is set) or "url" for HTTPS fetch (requires CLAWQL_EXTERNAL_INGEST_FETCH=1). Omit payload for roadmap preview.'
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Default true: validate only. Set false to write Markdown or (url mode) fetch and write."
        ),
      scope: z
        .string()
        .optional()
        .describe(
          "Optional vault-relative .md path for url imports (default: Memory/external/<slug>.md)."
        ),
      documents: z
        .array(
          z.object({
            path: z.string().min(1).max(512).describe("Vault-relative path; must end with .md"),
            markdown: z
              .string()
              .max(2_097_152)
              .describe("Markdown body UTF-8 (max ~2 MiB per file)."),
          })
        )
        .max(50)
        .optional()
        .describe("Bulk Markdown files to import when CLAWQL_EXTERNAL_INGEST=1."),
      url: z
        .string()
        .max(2048)
        .optional()
        .describe(
          "HTTPS URL to fetch when source is url and CLAWQL_EXTERNAL_INGEST_FETCH=1 (opt-in network)."
        ),
    },
    handleIngestExternalKnowledgeToolInput
  );

  if (getClawqlOptionalToolFlags().enableCache) {
    server.tool("cache", cacheToolSchema, handleCacheToolInput);
  }

  if (getClawqlOptionalToolFlags().enableAudit) {
    server.tool("audit", auditToolSchema, handleAuditToolInput);
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
    if (p?.bundledIntrospectionPath) {
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

/** Default field selection so the agent gets useful data without specifying fields. */
function defaultFields(operationId: string): string {
  if (operationId.includes(".services.list"))
    return "services { name uri latestReadyRevision reconciling createTime }\nnextPageToken";
  if (operationId.includes(".jobs.list"))
    return "jobs { name reconciling createTime updateTime }\nnextPageToken";
  if (operationId.includes(".executions.list"))
    return "executions { name job succeededCount failedCount runningCount createTime }\nnextPageToken";
  if (operationId.includes(".revisions.list"))
    return "revisions { name service reconciling createTime }\nnextPageToken";
  if (operationId.includes(".operations.list"))
    return "operations { name done error { code message } }\nnextPageToken";
  if (operationId.includes(".tasks.list"))
    return "tasks { name job execution createTime }\nnextPageToken";
  if (operationId.includes(".services.get"))
    return "name uri latestReadyRevision latestCreatedRevision reconciling terminalCondition { type state message } createTime updateTime";
  if (operationId.includes(".jobs.get"))
    return "name reconciling terminalCondition { type state message } latestCreatedExecution { name createTime } createTime updateTime";
  if (operationId.includes(".operations.get") || operationId.includes(".operations.wait"))
    return "name done error { code message } metadata";
  if (operationId.includes(".executions.get"))
    return "name job succeededCount failedCount runningCount completionTime createTime";
  if (operationId.includes("IamPolicy")) return "version bindings { role members }";
  if (
    operationId.includes(".create") ||
    operationId.includes(".patch") ||
    operationId.includes(".delete") ||
    operationId.includes(".run") ||
    operationId.includes(".cancel")
  )
    return "name done error { code message }";
  return "name";
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
