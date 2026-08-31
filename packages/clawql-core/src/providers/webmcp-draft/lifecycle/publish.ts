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
 * `callBoundOperation` is intentionally a stub — published tools are declarations only
 * until source-adapter binding lands (§6). Do not treat generated scripts as demo-ready.
 */
export const generatePublishScript = (
  version: PublishedWebMcpVersion
): Effect.Effect<string> =>
  Effect.sync(() => {
    const bindingMap = new Map<string, BoundOperation>(
      version.bindings.map((b) => [b.toolName, b])
    );
    const header =
      `/* WebMCP publish ${version.versionId} @ ${version.publishedAt} by ${version.publishedBy} */\n` +
      `/* WARNING: callBoundOperation is a stub — not bound to real source adapters yet */\n` +
      `(function(){\n` +
      `  var mc = (typeof document !== "undefined" && document.modelContext)\n` +
      `    || (typeof navigator !== "undefined" && navigator.modelContext);\n` +
      `  if (!mc || typeof mc.registerTool !== "function") {\n` +
      `    console.warn("[webmcp-draft] modelContext.registerTool unavailable");\n` +
      `    return;\n` +
      `  }\n` +
      `  function callBoundOperation(toolName, args) {\n` +
      `    // STUB: not wired to clawql-core source adapters (§6). Returns placeholder JSON.\n` +
      `    return Promise.resolve({ ok: true, toolName: toolName, args: args, stub: true });\n` +
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
