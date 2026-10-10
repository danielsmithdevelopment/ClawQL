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
 * Opt-in (8.0 demotion): ouroboros_* + clawql_think via clawql-harness (GitHub #141) — default OFF,
 * gate with CLAWQL_ENABLE_OUROBOROS_TOOLS=1 or instance/tier ouroboros.enabled; optional
 * CLAWQL_OUROBOROS_DATABASE_URL for Postgres lineage (#142).
 * Plugin enablement: {@link resolvePluginCompositionFlags} / ClawQLInstance — not CLAWQL_ENABLE_*.
 * Single-spec `execute` runs OpenAPI→GraphQL in-process; field resolution uses `graphql-execute-helpers`.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import {
  decodeExecuteInput,
  decodeResumeInput,
  decodeSearchInput,
  executeToolZodShape,
  resumeToolZodShape,
  ExecuteService,
  getPackageRoot,
  loadSpec,
  resolveBundledProvider,
  resumeClawqlExecutionEffect,
  SearchService,
  searchToolZodShape,
  sourcesProposeToolZodShape,
  cacheToolZodShape,
  auditToolZodShape,
  skillsListToolZodShape,
  skillsGetToolZodShape,
  handleSkillsListToolInput,
  handleSkillsGetToolInput,
  buildVarArgs,
  buildVarDeclarations,
  capturePathParams,
  discoveryTypeToGraphQL,
  normalizeArgsForField,
  operationIdToGraphQLName,
  operationIdToRunStyleName,
  defaultFields,
  executeOutputFields,
  projectRestByFields,
  agentPrincipalFromSessionIdEffect,
  proposeSourceEffect,
  buildConsoleLinkEffect,
  consoleLinkEnabled,
  plainProxyEnabled,
  parkedMandateStatusEffect,
  PendingExecutionLive,
  programsEnabled,
  durableProgramsEnabled,
  runProgramEffect,
  executeDurableProgramEffect,
  accumulateSessionIfcReadEffect,
  sessionIfcEnabledEffect,
  searchClawqlDocsEffect,
  submitProgramProposalsEffect,
  type CustomSourceKind,
  type ProgramHost,
  type ProgramSubmitHost,
} from "clawql-api";
import { z } from "zod";
import { attachChatgptExtensions } from "clawql-chatgpt-extensions";
import { currentLoadSpecEffect, getClawqlApi } from "../composition/clawql-api-adapters.js";
import { resolvePluginCompositionFlags } from "../composition/resolve-plugin-flags.js";
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
import { configureHomeSyncHooks } from "../composition/configure-home-sync.js";
import { handleMemorySyncToolInput, memorySyncToolSchema } from "../home-sync/memory-sync.js";
import { noteProcessRegisteredCapabilityTools } from "clawql-core";

export { executeOutputFields, projectRestByFields } from "clawql-api";

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

export async function handleClawqlResumeToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return getClawqlApi().run(
    Effect.gen(function* () {
      const params = yield* decodeResumeInput(raw);
      const content = yield* resumeClawqlExecutionEffect({
        executionId: params.executionId,
        decision: params.decision,
      });
      return { content: [...content] };
    })
  );
}

/** MCP `sources_propose` — preview or park a custom source. Approval is operator-only (CLI/console). */
export async function handleSourcesProposeToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  return getClawqlApi().run(
    Effect.gen(function* () {
      const o = (raw ?? {}) as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url : "";
      if (!url.trim()) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ ok: false, error: "url required" }) },
          ],
        };
      }
      const proposedBy = yield* agentPrincipalFromSessionIdEffect(
        typeof o.sessionId === "string" ? o.sessionId : undefined
      );
      const preview = yield* proposeSourceEffect({
        url,
        name: typeof o.name === "string" ? o.name : undefined,
        kind: typeof o.kind === "string" ? (o.kind as CustomSourceKind) : undefined,
        id: typeof o.id === "string" ? o.id : undefined,
        dryRun: o.dryRun !== false,
        proposedBy,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(preview, null, 2) }] };
    })
  );
}

export { SLACK_NOTIFY_OPERATION_ID, handleNotifyToolInput };

/** Zod shape for Core `console_link` (gated by CLAWQL_ENABLE_CONSOLE_LINK). */
export const consoleLinkToolZodShape = {
  path: z
    .string()
    .optional()
    .describe("Deep-link path under the console, e.g. activity/<id> or overview"),
  sessionId: z.string().optional().describe("MCP / API session id (defaults to CLAWQL_SESSION_ID)"),
  orgId: z.string().optional().describe("Optional org / tenant id (defaults to CLAWQL_ORG_ID)"),
} as const;

/** MCP `console_link` — returns an HTTPS deep link into the ClawQL console. */
export async function handleConsoleLinkToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const result = await Effect.runPromise(
    buildConsoleLinkEffect({
      path: typeof o.path === "string" ? o.path : undefined,
      sessionId: typeof o.sessionId === "string" ? o.sessionId : undefined,
      orgId: typeof o.orgId === "string" ? o.orgId : undefined,
    })
  );
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function docsSearchToolEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.CLAWQL_ENABLE_DOCS_SEARCH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const EXECUTE_PROGRAM_SOURCE_DESCRIPTION =
  "v0 JSON plan text (not free-form JS): " +
  '{ "v": 1, "mode": "parallel"|"sequential", "calls": [ ' +
  '{ "id": "A", "tool": "execute", "operationId": "...", "args": {} } | ' +
  '{ "tool": "search", "query": "..." } ], ' +
  '"proposals": [ { "id": "W1", "operationId": "...", "args": { "title": { "$ref": "A.result.title" } } } ] }. ' +
  "Calls are reads; proposals are writes the program returns but never runs. " +
  "$ref targets a read call (<id>.result.<path>) or an earlier proposal (<id>.args.<path> / <id>.result.<path>, " +
  "the latter filled when submitted) and must resolve to one string, number, boolean, or null. " +
  "Honesty: v0 plan runner; OpenCode vendor is next.";

/** Zod shape for optional Core `execute_program` (CLAWQL_ENABLE_PROGRAMS). */
export const executeProgramToolZodShape = {
  source: z.string().describe(EXECUTE_PROGRAM_SOURCE_DESCRIPTION),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Wall-clock timeout in ms (capped by CLAWQL_PROGRAM_MAX_TIMEOUT_MS)."),
} as const;

/** `execute_program` shape when CLAWQL_ENABLE_DURABLE_PROGRAMS=1: resume by programId. */
export const durableExecuteProgramToolZodShape = {
  source: z
    .string()
    .optional()
    .describe(
      `${EXECUTE_PROGRAM_SOURCE_DESCRIPTION} Required to start a program; omit it to resume ` +
        "one by programId (when given on resume it must match)."
    ),
  programId: z
    .string()
    .optional()
    .describe(
      "Durable program id (prog_…) from an earlier execute_program. With a journal: resume " +
        "it (journaled calls replay, not re-run). With source and an unused id: start a " +
        "program under that id. Omit to start a program under a new id."
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Wall-clock timeout in ms for this attempt (capped by CLAWQL_PROGRAM_MAX_TIMEOUT_MS); " +
        "a timed-out program parks and can be resumed."
    ),
} as const;

/**
 * MCP host wiring: each program tool call goes through the same ExecuteService /
 * SearchService path as the Core MCP tools (gate, session IFC, audit), with
 * programId correlation recorded by the plan runner.
 */
function makeMcpProgramHost(): ProgramHost {
  return {
    execute: (input, _ctx) =>
      Effect.tryPromise({
        try: () =>
          getClawqlApi().run(
            Effect.gen(function* () {
              const execute = yield* ExecuteService;
              return yield* execute.execute(input);
            })
          ),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
    search: (input, _ctx) =>
      Effect.tryPromise({
        try: () =>
          getClawqlApi().run(
            Effect.gen(function* () {
              const search = yield* SearchService;
              return yield* search.search(input);
            })
          ),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
    resolveRisk: resolveProgramOperationEffect,
    // Session IFC labels live in process memory: a replayed read labels the session
    // again, whatever its outcome (an extra label only makes later writes stricter).
    replayed: (call) =>
      Effect.gen(function* () {
        if (call.tool !== "execute" || call.operationId === undefined) return;
        if (!(yield* sessionIfcEnabledEffect())) return;
        const info = yield* resolveProgramOperationEffect(call.operationId);
        if (!info.found) {
          return yield* Effect.fail(new Error(`Unknown operationId: ${call.operationId}`));
        }
        yield* accumulateSessionIfcReadEffect({ operation: info.operation, success: true });
      }),
  };
}

/** Risk and catalog facts for an operationId, from the same spec execute runs against. */
function resolveProgramOperationEffect(operationId: string) {
  return Effect.gen(function* () {
    const load = yield* currentLoadSpecEffect;
    const { operations } = yield* Effect.tryPromise({
      try: () => load(),
      catch: (e) => (e instanceof Error ? e : new Error(String(e))),
    });
    const op = operations.find((o) => o.id === operationId);
    if (!op) return { found: false as const };
    return {
      found: true as const,
      policy: op.risk?.policy,
      risk: op.risk,
      operation: op,
    };
  });
}

/**
 * MCP `execute_program` — JSON plan runner (ADR 0015 v0). With
 * CLAWQL_ENABLE_DURABLE_PROGRAMS=1 the program is journaled and resumable by `programId`.
 */
export async function handleExecuteProgramToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const source = typeof o.source === "string" ? o.source : undefined;
  const timeoutMs =
    typeof o.timeoutMs === "number" && Number.isFinite(o.timeoutMs) ? o.timeoutMs : undefined;
  const sessionId =
    typeof o.sessionId === "string" ? o.sessionId : process.env.CLAWQL_SESSION_ID?.trim();
  const result = await Effect.runPromise(
    durableProgramsEnabled()
      ? executeDurableProgramEffect(
          {
            source,
            programId: typeof o.programId === "string" ? o.programId : undefined,
            timeoutMs,
            sessionId,
          },
          makeMcpProgramHost()
        )
      : runProgramEffect({ source: source ?? "", timeoutMs, sessionId }, makeMcpProgramHost())
  );
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

/** Zod shape for optional Core `submit_program_proposals` (CLAWQL_ENABLE_PROGRAMS). */
export const submitProgramProposalsToolZodShape = {
  programId: z.string().describe("programId (prog_…) returned by execute_program"),
  proposals: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe(
      "result.proposals from execute_program. Omit while this server still holds the program; " +
        "when given for a stored program it must match exactly."
    ),
} as const;

/**
 * Proposals run through the same ExecuteService path as MCP `execute` (gate, risk,
 * session IFC, mandate park, audit). Parked leaves are only re-checked here: approval
 * stays with Review / `resume`.
 */
function makeMcpProgramSubmitHost(): ProgramSubmitHost {
  return {
    execute: (input, _ctx) =>
      Effect.tryPromise({
        try: () =>
          getClawqlApi().run(
            Effect.gen(function* () {
              const execute = yield* ExecuteService;
              return yield* execute.execute(input);
            })
          ),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }),
    lookup: resolveProgramOperationEffect,
    pendingStatus: (executionId) =>
      parkedMandateStatusEffect(executionId).pipe(Effect.provide(PendingExecutionLive)),
  };
}

/** MCP `submit_program_proposals` — run a program's proposals through normal execute (ADR 0015). */
export async function handleSubmitProgramProposalsToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const result = await Effect.runPromise(
    submitProgramProposalsEffect(
      {
        programId: typeof o.programId === "string" ? o.programId : "",
        proposals: o.proposals,
        sessionId:
          typeof o.sessionId === "string" ? o.sessionId : process.env.CLAWQL_SESSION_ID?.trim(),
      },
      makeMcpProgramSubmitHost()
    )
  );
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

/** Zod shape for optional Core `docs_search` (CLAWQL_ENABLE_DOCS_SEARCH). */
export const docsSearchToolZodShape = {
  query: z.string().describe("Search query over ClawQL documentation"),
  limit: z.number().int().min(1).max(20).optional().describe("Max hits (default 8)"),
} as const;

/** MCP `docs_search` — dedicated docs index search (also merged into Core `search` when index present). */
export async function handleDocsSearchToolInput(
  raw: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const o = (raw ?? {}) as Record<string, unknown>;
  const query = typeof o.query === "string" ? o.query : "";
  const limit = typeof o.limit === "number" && Number.isFinite(o.limit) ? o.limit : 8;
  const hits = await Effect.runPromise(searchClawqlDocsEffect(query, limit));
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: true,
          query,
          count: hits.length,
          results: hits.map((h) => ({
            kind: "doc" as const,
            url: h.url,
            href: `${h.baseUrl.replace(/\/$/, "")}${h.url.startsWith("/") ? h.url : `/${h.url}`}`,
            title: h.title,
            pageTitle: h.pageTitle ?? null,
            score: h.score,
            matchedOn: h.matchedOn,
          })),
        }),
      },
    ],
  };
}

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
  const registeredNames: string[] = [
    "search",
    "execute",
    "cache",
    "audit",
    "skills_list",
    "skills_get",
  ];

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

  server.tool(
    "resume",
    resumeToolZodShape,
    wrapRegisteredMcpToolHandler("resume", handleClawqlResumeToolInput)
  );
  registeredNames.push("resume");

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
  server.tool(
    "skills_list",
    skillsListToolZodShape,
    wrapRegisteredMcpToolHandler("skills_list", handleSkillsListToolInput)
  );
  server.tool(
    "skills_get",
    skillsGetToolZodShape,
    wrapRegisteredMcpToolHandler("skills_get", handleSkillsGetToolInput)
  );

  server.tool(
    "sources_propose",
    "Preview (default) or park a custom source proposal with operation-risk summary. Does not write sources.json until an operator approves via CLI (`clawql sources approve`) or console — never via MCP.",
    sourcesProposeToolZodShape,
    wrapRegisteredMcpToolHandler("sources_propose", handleSourcesProposeToolInput)
  );
  registeredNames.push("sources_propose");

  // ADR 0015 catalog win: Core deep link for non-ChatGPT clients (opt-in).
  // ChatGPT Apps still use clawql_console → ui://clawql/console when extensions attach.
  if (consoleLinkEnabled()) {
    server.tool(
      "console_link",
      "Return an HTTPS deep-link URL into the ClawQL console for the current session/org (Core alias of clawql_console).",
      consoleLinkToolZodShape,
      wrapRegisteredMcpToolHandler("console_link", handleConsoleLinkToolInput)
    );
    registeredNames.push("console_link");
  }

  // ADR 0015 plain proxy: thin execute alias for harnesses with their own catalog UX.
  // Spec: docs/specs/mcp/plain-proxy-mode-v0.1.md
  if (plainProxyEnabled()) {
    server.tool(
      "proxy_call",
      "Plain-proxy alias of execute for harnesses that already know operationId (same gate/risk/redaction/audit path). Enable with CLAWQL_ENABLE_PLAIN_PROXY=1 or CLAWQL_PLAIN_PROXY_KEY_GROUPS + CLAWQL_API_KEY_GROUP.",
      executeToolZodShape,
      wrapRegisteredMcpToolHandler("proxy_call", handleClawqlExecuteToolInput)
    );
    registeredNames.push("proxy_call");
  }

  // ADR 0015 program mode v0: read-only JSON plan runner (not full OpenCode interpreter).
  if (programsEnabled()) {
    if (durableProgramsEnabled()) {
      server.tool(
        "execute_program",
        "Run a read-only JSON plan of parallel/sequential search+execute calls in one round trip, durably (ADR 0015 v0 plan runner). Writes never run inside a program: list them in plan.proposals and they come back resolved (with $ref values filled and the argsHash a mandate would bind) for submit_program_proposals or plain execute. Each completed call is journaled (fsync) before the program moves on; a crashed or timed-out program resumes with execute_program { programId }: journaled calls replay and are not re-run, and a non-read call (risk policy allow) in flight when it stopped resumes as outcome_unknown. Honesty: the durable journal is a celld-shaped file (JSONL) stand-in until the celld pin hosts the isolate; not free-form JS. Enabled by CLAWQL_ENABLE_DURABLE_PROGRAMS=1.",
        durableExecuteProgramToolZodShape,
        wrapRegisteredMcpToolHandler("execute_program", handleExecuteProgramToolInput)
      );
    } else {
      server.tool(
        "execute_program",
        "Run a read-only JSON plan of parallel/sequential search+execute calls in one round trip (ADR 0015 v0 plan runner; OpenCode vendor is next). Writes never run inside a program: list them in plan.proposals and they come back resolved (with $ref values filled and the argsHash a mandate would bind) for submit_program_proposals or plain execute. Enable with CLAWQL_ENABLE_PROGRAMS=1.",
        executeProgramToolZodShape,
        wrapRegisteredMcpToolHandler("execute_program", handleExecuteProgramToolInput)
      );
    }
    registeredNames.push("execute_program");
    server.tool(
      "submit_program_proposals",
      "Run the proposals an execute_program call returned, in plan order, each through the normal execute path (gate, risk, session IFC, mandate park, audit) — not atomic. Fills <id>.result refs from earlier proposals' results. Each leaf ends ran, failed, dropped, or pending (e.g. mandate_required); call again with the same programId after approving in Review to continue — settled leaves never run twice.",
      submitProgramProposalsToolZodShape,
      wrapRegisteredMcpToolHandler(
        "submit_program_proposals",
        handleSubmitProgramProposalsToolInput
      )
    );
    registeredNames.push("submit_program_proposals");
  }

  // ADR 0015: dedicated docs search (Core `search` also merges kind:doc when an index exists).
  if (docsSearchToolEnabled()) {
    server.tool(
      "docs_search",
      "Search ClawQL documentation (kind:doc). Prefer Core search when you also need operations/skills; use this for docs-only.",
      docsSearchToolZodShape,
      wrapRegisteredMcpToolHandler("docs_search", handleDocsSearchToolInput)
    );
    registeredNames.push("docs_search");
  }

  registerPluginMcpTools(server);
  for (const tool of getClawqlApi().listMcpTools()) {
    registeredNames.push(tool.name);
  }

  if (resolvePluginCompositionFlags().enableChatgptExtensions) {
    // ChatGPT-only surfaces: settings always; UI tools when host supports MCP Apps.
    // Non-ChatGPT clients still connect — UI tools use app-only visibility / capability omit.
    const attached = attachChatgptExtensions(server);
    if (attached.attached) {
      registeredNames.push(
        "clawql_settings_read",
        "clawql_settings_update",
        "clawql_mentions_search",
        "clawql_evidence",
        "clawql_console",
        "clawql_open_file"
      );
    }
  }

  if (resolvePluginCompositionFlags().enableMemory) {
    server.tool(
      "memory_sync",
      memorySyncToolSchema,
      wrapRegisteredMcpToolHandler("memory_sync", handleMemorySyncToolInput)
    );
    registeredNames.push("memory_sync");
  }

  // Capability lifecycle default-on: seed unbound sessions with tools actually
  // live on this process (optional notify/onyx/schedule included when registered).
  noteProcessRegisteredCapabilityTools(registeredNames);
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
