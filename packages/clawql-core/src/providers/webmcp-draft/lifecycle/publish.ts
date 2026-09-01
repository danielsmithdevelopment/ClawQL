import { Effect } from "effect";
import { AuditService } from "../../../audit/audit-service.js";
import { ClawQLError } from "../../../errors/clawql-error.js";
import { fireHooksForEvent } from "../../../plugin/hook-runtime.js";
import {
  HookRegistry,
  WormAuditSink,
  type HookContext,
  type SecurityError,
} from "../../../plugin/provider-types.js";
import {
  WebMcpDraftInvalidStateError,
  WebMcpDraftNotFoundError,
} from "../errors.js";
import type { BoundOperation, PublishedWebMcpVersion } from "../types.js";
import { DraftStoreService } from "./draft-store.js";
import { webMcpDraftPreIngestHook } from "./pre-ingest-gate.js";

/**
 * Emit standard WebMCP `document.modelContext.registerTool()` calls for a published version.
 *
 * `callBoundOperation` POSTs to a ClawQL bind endpoint which runs
 * {@link executeBoundOperation} (forms → HTTP submit; openapi/graphql → ExecuteService).
 */
export type GeneratePublishScriptOptions = {
  /**
   * Absolute or same-origin URL for `POST` bound execute.
   * Defaults to `CLAWQL_WEBMCP_BIND_URL` or `/webmcp-draft/bound-execute`.
   */
  readonly bindUrl?: string;
  readonly versionId?: string;
};

export const generatePublishScript = (
  version: PublishedWebMcpVersion,
  options: GeneratePublishScriptOptions = {}
): Effect.Effect<string> =>
  Effect.sync(() => {
    const bindingMap = new Map<string, BoundOperation>(
      version.bindings.map((b) => [b.toolName, b])
    );
    const bindUrl =
      options.bindUrl?.trim() ||
      (typeof process !== "undefined" && process.env?.CLAWQL_WEBMCP_BIND_URL?.trim()) ||
      "/webmcp-draft/bound-execute";
    const versionId = options.versionId ?? version.versionId;
    const bindingsJson = JSON.stringify(version.bindings);
    const header =
      `/* WebMCP publish ${version.versionId} @ ${version.publishedAt} by ${version.publishedBy} */\n` +
      `/* callBoundOperation → ${bindUrl} (ExecuteService / form submit via clawql-api) */\n` +
      `(function(){\n` +
      `  var mc = (typeof document !== "undefined" && document.modelContext)\n` +
      `    || (typeof navigator !== "undefined" && navigator.modelContext);\n` +
      `  if (!mc || typeof mc.registerTool !== "function") {\n` +
      `    console.warn("[webmcp-draft] modelContext.registerTool unavailable");\n` +
      `    return;\n` +
      `  }\n` +
      `  var BIND_URL = ${JSON.stringify(bindUrl)};\n` +
      `  var VERSION_ID = ${JSON.stringify(versionId)};\n` +
      `  var BINDINGS = ${bindingsJson};\n` +
      `  function callBoundOperation(toolName, args) {\n` +
      `    return fetch(BIND_URL, {\n` +
      `      method: "POST",\n` +
      `      headers: { "content-type": "application/json", "accept": "application/json" },\n` +
      `      credentials: "same-origin",\n` +
      `      body: JSON.stringify({ versionId: VERSION_ID, toolName: toolName, args: args || {}, bindings: BINDINGS })\n` +
      `    }).then(function(res) {\n` +
      `      return res.text().then(function(text) {\n` +
      `        var data; try { data = JSON.parse(text); } catch (e) { data = { ok: res.ok, body: text }; }\n` +
      `        if (!res.ok) {\n` +
      `          var err = new Error((data && (data.error || data.reason)) || ("bound execute HTTP " + res.status));\n` +
      `          err.payload = data; throw err;\n` +
      `        }\n` +
      `        return data;\n` +
      `      });\n` +
      `    });\n` +
      `  }\n`;

    const tools = version.publishedTools
      .map((tool) => {
        const binding = bindingMap.get(tool.name);
        const bindingComment = binding
          ? `  // bound: ${binding.sourceType} ${binding.sourceRef}\n`
          : "";
        return (
          bindingComment +
          `  mc.registerTool({\n` +
          `    name: ${JSON.stringify(tool.name)},\n` +
          `    description: ${JSON.stringify(tool.description)},\n` +
          `    inputSchema: ${JSON.stringify(tool.inputSchema)},\n` +
          `    async execute(args) {\n` +
          `      var result = await callBoundOperation(${JSON.stringify(tool.name)}, args);\n` +
          `      return typeof result === "string" ? result : JSON.stringify(result);\n` +
          `    },\n` +
          `  });`
        );
      })
      .join("\n");

    return `${header}${tools}\n})();\n`;
  });

function sessionCtx(
  publishedBy: string,
  tool: { readonly name: string; readonly description: string; readonly inputSchema: unknown }
): HookContext {
  return {
    session: {
      id: `webmcp-draft-publish:${publishedBy}`,
      atrScope: new Set(),
    },
    toolName: tool.name,
    payload: tool,
  };
}

/** Ensure our LifecycleHook is on this HookRegistry (install path or Live MCP self-heal). */
const ensurePreIngestHook = Effect.gen(function* () {
  const hooksReg = yield* HookRegistry;
  const listed = yield* hooksReg.list("pre-ingest");
  if (listed.some((h) => h.id === webMcpDraftPreIngestHook.id)) return;
  yield* hooksReg.register("clawql-webmcp-draft", [webMcpDraftPreIngestHook]);
});

export const publishApprovedTool = (input: {
  readonly publishedBy: string;
  readonly candidateIds?: readonly string[];
}): Effect.Effect<
  PublishedWebMcpVersion,
  | WebMcpDraftNotFoundError
  | WebMcpDraftInvalidStateError
  | ClawQLError
  | SecurityError
  | Error,
  DraftStoreService | AuditService | HookRegistry | WormAuditSink
> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const audit = yield* AuditService;
    const hooksReg = yield* HookRegistry;

    yield* ensurePreIngestHook;

    const approved = yield* store.listCandidates("approved");
    const toPublish = approved.filter((c) => {
      if (input.candidateIds && !input.candidateIds.includes(c.candidateId)) return false;
      return true;
    });

    const registered = yield* hooksReg.list("pre-ingest");
    for (const candidate of toPublish) {
      const tool = candidate.editedTool
        ? {
            name: candidate.editedTool.name ?? candidate.proposedTool.name,
            description:
              candidate.editedTool.description ?? candidate.proposedTool.description,
            inputSchema:
              candidate.editedTool.inputSchema ?? candidate.proposedTool.inputSchema,
          }
        : candidate.proposedTool;

      const result = yield* fireHooksForEvent(
        registered,
        sessionCtx(input.publishedBy, tool),
        { stopOnDeny: true }
      );

      if (!result.allow) {
        yield* audit.append({
          category: "webmcp-draft",
          action: "WEBMCP_DRAFT_PRE_INGEST_BLOCKED",
          summary: `pre-ingest blocked publish of ${tool.name}: ${result.denyReason ?? "denied"}`,
          correlationId: candidate.candidateId,
        });
        return yield* Effect.fail(
          new ClawQLError({
            reason: result.denyReason ?? `pre-ingest blocked ${tool.name}`,
          })
        );
      }
    }

    const version = yield* store.publishApproved(input);
    yield* audit.append({
      category: "webmcp-draft",
      action: "WEBMCP_DRAFT_PUBLISHED",
      summary: `Published ${version.publishedTools.length} tool(s) as ${version.versionId}`,
      correlationId: version.versionId,
    });
    return version;
  });
