/**
 * tools.ts
 *
 * Core tools: search (spec discovery), execute (GraphQL-backed REST call), audit (in-process ring buffer; GitHub #89 — not durable; use memory_ingest for compliance trails), cache (in-process LRU KV; GitHub #75 — not persisted; use memory_* for vault).
 * Optional: **`sandbox_exec`** when **`CLAWQL_ENABLE_SANDBOX=1`** — bridge / Seatbelt / Docker (`CLAWQL_SANDBOX_BACKEND`).
 * memory_ingest / memory_recall — Obsidian vault notes (default on; set CLAWQL_ENABLE_MEMORY=0 to hide; writable vault).
 * Optional: ingest_external_knowledge — bulk Markdown + optional URL fetch (GitHub #40); default on; **`CLAWQL_ENABLE_DOCUMENTS=0`** to hide.
 * Optional: knowledge_search_onyx — Onyx when CLAWQL_ENABLE_ONYX and documents enabled; **`CLAWQL_ENABLE_DOCUMENTS=0`** hides (GitHub #118).
 * Optional: schedule — persisted jobs + manual synthetic trigger when CLAWQL_ENABLE_SCHEDULE (GitHub #76).
 * Optional: notify — Slack chat.postMessage when CLAWQL_ENABLE_NOTIFY (GitHub #77); requires Slack in loaded spec + bot token.
 * Optional: hitl_enqueue_label_studio — Label Studio review queue when CLAWQL_ENABLE_HITL_LABEL_STUDIO (GitHub #228).
 * Optional: ouroboros_* — evolutionary loop tools when CLAWQL_ENABLE_OUROBOROS (GitHub #141); optional CLAWQL_OUROBOROS_DATABASE_URL for Postgres lineage (#142).
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
import { executeNativeGraphQL } from "./execute-native-graphql.js";
import { executeNativeGrpc } from "./execute-native-grpc.js";
import { loadSpec, resolveApiBaseUrlForOperation } from "./spec-loader.js";
import { searchOperations, formatSearchResults } from "./spec-search.js";
import { executeRestOperation, mergedAuthHeaders } from "./rest-operation.js";
import { handleClawqlCodeToolInput } from "./sandbox-bridge-client.js";
import { handleIngestExternalKnowledgeToolInput } from "./external-ingest.js";
import { handleMemoryIngestToolInput } from "./memory-ingest.js";
import { handleMemoryRecallToolInput } from "./memory-recall.js";
import { cacheToolSchema, handleCacheToolInput } from "./clawql-cache.js";
import { auditToolSchema, handleAuditToolInput } from "./clawql-audit.js";
import { handleScheduleToolInput, scheduleToolSchema } from "./clawql-schedule.js";
import { getClawqlOptionalToolFlags } from "./clawql-optional-flags.js";
import { handleKnowledgeSearchOnyxToolInput } from "./knowledge-search-onyx.js";
import { registerOuroborosTools } from "./ouroboros-mcp.js";
import { handleHitlEnqueueLabelStudioToolInput } from "./hitl-label-studio.js";
import { wrapMcpToolHandler } from "./otel-tracing.js";
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
    case "chat_postMessage":
      // Include `error` so Slack `ok:false` bodies survive projection before `notify` remaps them.
      return ["ok", "error", "channel", "ts", "message", "warning"];
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

  if (op.protocolKind === "graphql" && op.nativeGraphQL) {
    const selectedFields = outputFields?.length ? outputFields.join("\n        ") : "__typename";
    const exec = await executeNativeGraphQL(op, args, selectedFields);
    if (!exec.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: exec.error,
              specLabel: op.specLabel ?? null,
              hint: "Native GraphQL execute failed (check endpoint, auth, and arguments).",
            }),
          },
        ],
      };
    }
    const root = exec.data as Record<string, unknown> | null | undefined;
    const inner =
      root && typeof root === "object" && op.nativeGraphQL.fieldName in root
        ? root[op.nativeGraphQL.fieldName]
        : exec.data;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projectRestByFields(inner, outputFields), null, 2),
        },
      ],
    };
  }

  if (op.protocolKind === "grpc" && op.nativeGrpc) {
    const exec = await executeNativeGrpc(op, args);
    if (!exec.ok) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: exec.error,
              specLabel: op.specLabel ?? null,
              hint: "Native gRPC execute failed (check endpoint, TLS/insecure, proto, and arguments).",
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(projectRestByFields(exec.data, outputFields), null, 2),
        },
      ],
    };
  }

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
              hint: "Multi-spec OpenAPI operations use REST only. Native GraphQL/gRPC ops use protocol execute.",
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

/** Slack Web API `chat.postMessage` operation id in bundled `providers/slack/openapi.json`. */
export const SLACK_NOTIFY_OPERATION_ID = "chat_postMessage";

/**
 * MCP `notify`: posts to Slack via the same path as `execute(chat_postMessage, …)`.
 * Registered only when `CLAWQL_ENABLE_NOTIFY=1` ([#77]).
 */
export async function handleNotifyToolInput(params: {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: string;
  attachments?: string;
  username?: string;
  icon_emoji?: string;
  icon_url?: string;
  mrkdwn?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
  reply_broadcast?: boolean;
  parse?: string;
  link_names?: boolean;
  as_user?: boolean;
  fields?: string[];
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const auth = mergedAuthHeaders("slack");
  if (!auth.Authorization) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              "Slack bot token missing. Set CLAWQL_SLACK_TOKEN (or SLACK_BOT_TOKEN, SLACK_TOKEN, CLAWQL_SLACK_BOT_TOKEN), or a `slack` entry in CLAWQL_PROVIDER_AUTH_JSON.",
          }),
        },
      ],
    };
  }

  const channel = params.channel?.trim();
  const text = params.text?.trim();
  if (!channel || !text) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "`channel` and `text` are required (non-empty strings)." }),
        },
      ],
    };
  }

  const loaded = await loadSpec();
  const op = loaded.operations.find((o) => o.id === SLACK_NOTIFY_OPERATION_ID);
  if (!op) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Loaded spec has no Slack ${SLACK_NOTIFY_OPERATION_ID} (chat.postMessage). Include slack in CLAWQL_BUNDLED_PROVIDERS, set CLAWQL_PROVIDER=slack, or point CLAWQL_SPEC_PATH at the Slack Web API OpenAPI.`,
          }),
        },
      ],
    };
  }

  const args: Record<string, unknown> = { channel, text };
  const passthrough: (keyof typeof params)[] = [
    "thread_ts",
    "blocks",
    "attachments",
    "username",
    "icon_emoji",
    "icon_url",
    "parse",
  ];
  for (const k of passthrough) {
    const v = params[k];
    if (typeof v === "string" && v.trim()) args[k] = v.trim();
  }
  if (params.mrkdwn !== undefined) args.mrkdwn = params.mrkdwn;
  if (params.unfurl_links !== undefined) args.unfurl_links = params.unfurl_links;
  if (params.unfurl_media !== undefined) args.unfurl_media = params.unfurl_media;
  if (params.reply_broadcast !== undefined) args.reply_broadcast = params.reply_broadcast;
  if (params.link_names !== undefined) args.link_names = params.link_names;
  if (params.as_user !== undefined) args.as_user = params.as_user;

  const exec = await handleClawqlExecuteToolInput({
    operationId: SLACK_NOTIFY_OPERATION_ID,
    args,
    fields: params.fields?.length ? params.fields : undefined,
  });
  const body = exec.content[0]?.text;
  if (typeof body !== "string") return exec;
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; error?: string };
    if (parsed && typeof parsed === "object" && parsed.ok === false) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: parsed.error ?? "Slack API returned ok:false",
              slack: parsed,
            }),
          },
        ],
      };
    }
  } catch {
    // non-JSON execute error — return as-is
  }
  return exec;
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
    wrapMcpToolHandler("search", handleClawqlSearchToolInput)
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
    wrapMcpToolHandler("execute", handleClawqlExecuteToolInput)
  );

  if (getClawqlOptionalToolFlags().enableSandbox) {
    const sandboxCodeSchema = {
      code: z
        .string()
        .describe(
          "Source code to run isolated. CLAWQL_SANDBOX_BACKEND unset = Cloudflare bridge only; auto = Seatbelt then Docker then bridge; or pin bridge|macos-seatbelt|docker."
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

    server.tool(
      "sandbox_exec",
      sandboxCodeSchema,
      wrapMcpToolHandler("sandbox_exec", handleClawqlCodeToolInput)
    );
  }

  const memoryEnterpriseCitationSchema = z.object({
    title: z.string().max(500).optional(),
    url: z.string().max(2048).optional(),
    document_id: z.string().max(200).optional(),
    source: z.string().max(200).optional(),
    snippet: z.string().max(400).optional(),
  });

  if (getClawqlOptionalToolFlags().enableMemory) {
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
        enterpriseCitations: z
          .array(memoryEnterpriseCitationSchema)
          .max(30)
          .optional()
          .describe(
            "Optional short citation rows (e.g. trimmed from Onyx `knowledge_search_onyx` JSON). " +
              "Stored as a small Markdown block in the vault — not full retrieval payloads (#130)."
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
      wrapMcpToolHandler("memory_ingest", handleMemoryIngestToolInput)
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
      wrapMcpToolHandler("memory_recall", handleMemoryRecallToolInput)
    );
  }

  if (getClawqlOptionalToolFlags().enableDocuments) {
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
      wrapMcpToolHandler("ingest_external_knowledge", handleIngestExternalKnowledgeToolInput)
    );
  }

  server.tool("cache", cacheToolSchema, wrapMcpToolHandler("cache", handleCacheToolInput));

  server.tool("audit", auditToolSchema, wrapMcpToolHandler("audit", handleAuditToolInput));

  if (getClawqlOptionalToolFlags().enableSchedule) {
    server.tool(
      "schedule",
      scheduleToolSchema,
      wrapMcpToolHandler("schedule", handleScheduleToolInput)
    );
  }

  if (getClawqlOptionalToolFlags().enableNotify) {
    server.tool(
      "notify",
      {
        channel: z
          .string()
          .min(1)
          .describe(
            "Channel ID (C…), private group, or DM — same as Slack chat.postMessage `channel`."
          ),
        text: z
          .string()
          .min(1)
          .describe("Message text. Include Onyx/Paperless links inline for workflow summaries."),
        thread_ts: z
          .string()
          .optional()
          .describe("Optional parent message `ts` to post in a thread."),
        blocks: z
          .string()
          .optional()
          .describe("Optional JSON string of Block Kit blocks (Slack form field `blocks`)."),
        attachments: z.string().optional().describe("Optional JSON string of legacy attachments."),
        username: z
          .string()
          .optional()
          .describe("Override bot display name (requires as_user false)."),
        icon_emoji: z.string().optional().describe("Override bot icon emoji."),
        icon_url: z.string().optional().describe("Override bot icon image URL."),
        mrkdwn: z.boolean().optional().describe("Pass false to disable Slack mrkdwn parsing."),
        unfurl_links: z.boolean().optional(),
        unfurl_media: z.boolean().optional(),
        reply_broadcast: z.boolean().optional(),
        parse: z.string().optional().describe("Slack parse mode: full | none | …"),
        link_names: z.boolean().optional(),
        as_user: z.boolean().optional(),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Optional top-level response keys to return (same as execute `fields`). " +
              "Omit for defaults: ok, channel, ts, message."
          ),
      },
      wrapMcpToolHandler("notify", handleNotifyToolInput)
    );
  }

  if (getClawqlOptionalToolFlags().enableHitlLabelStudio) {
    server.tool(
      "hitl_enqueue_label_studio",
      {
        project_id: z
          .number()
          .int()
          .min(1)
          .describe("Label Studio project id (integer pk in /api/projects/{id}/import)."),
        tasks: z
          .array(
            z.object({
              data: z
                .record(z.string(), z.unknown())
                .describe("Task fields shown to annotators (maps to Label Studio task.data)."),
              meta: z
                .record(z.string(), z.unknown())
                .optional()
                .describe("Optional extra JSON merged into task.data.meta."),
            })
          )
          .min(1)
          .max(100)
          .describe("Tasks to import in one batch."),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Optional model confidence stored under data.clawql_hitl.confidence."),
        correlation_id: z
          .string()
          .max(512)
          .optional()
          .describe("Optional id for OpenClaw / logs / webhook correlation."),
        seed_id: z.string().max(256).optional().describe("Optional Ouroboros or workflow seed id."),
        provenance: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional provenance object stored under data.clawql_hitl.provenance."),
      },
      wrapMcpToolHandler("hitl_enqueue_label_studio", handleHitlEnqueueLabelStudioToolInput)
    );
  }

  if (
    getClawqlOptionalToolFlags().enableOnyxKnowledge &&
    getClawqlOptionalToolFlags().enableDocuments
  ) {
    server.tool(
      "knowledge_search_onyx",
      {
        query: z
          .string()
          .min(1)
          .describe(
            "Natural language or keyword query against the Onyx index (maps to `search_query` on the Onyx API)."
          ),
        num_hits: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Max hits to return (default 15)."),
        include_content: z
          .boolean()
          .optional()
          .describe("Include chunk/content in results when supported (default true)."),
        stream: z
          .boolean()
          .optional()
          .describe("Must be false or omitted; streaming is not supported for this tool."),
        run_query_expansion: z
          .boolean()
          .optional()
          .describe("Whether to run query expansion on the Onyx side (default false)."),
        hybrid_alpha: z
          .number()
          .optional()
          .describe("Optional hybrid search alpha (Onyx-specific)."),
        filters: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional Onyx index filters object."),
        tenant_id: z.string().optional().describe("Optional multi-tenant id (query parameter)."),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            "Optional top-level JSON keys to keep from the Onyx response (same as execute `fields`)."
          ),
      },
      wrapMcpToolHandler("knowledge_search_onyx", handleKnowledgeSearchOnyxToolInput)
    );
  }

  if (getClawqlOptionalToolFlags().enableOuroboros) {
    registerOuroborosTools(server);
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
