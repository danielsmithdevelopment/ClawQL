import { Effect } from "effect";
import { AuditService } from "../../../audit/audit-service.js";
import {
  WebMcpDraftInvalidStateError,
  WebMcpDraftNotFoundError,
} from "../errors.js";
import type { BoundOperation, PublishedWebMcpVersion } from "../types.js";
import { DraftStoreService } from "./draft-store.js";

/**
 * Emit standard WebMCP `document.modelContext.registerTool()` calls for a published version.
 * Uses `document.modelContext` first (PixelDrop / Imperative API preference), with a
 * navigator fallback comment for hosts that only expose the older surface.
 */
export const generatePublishScript = (
  version: PublishedWebMcpVersion
): Effect.Effect<string> =>
  Effect.sync(() => {
    const bindingMap = new Map<string, BoundOperation>(
      version.bindings.map((b) => [b.toolName, b])
    );
    const header = `/* WebMCP publish ${version.versionId} @ ${version.publishedAt} by ${version.publishedBy} */\n` +
      `(function(){\n` +
      `  var mc = (typeof document !== "undefined" && document.modelContext)\n` +
      `    || (typeof navigator !== "undefined" && navigator.modelContext);\n` +
      `  if (!mc || typeof mc.registerTool !== "function") {\n` +
      `    console.warn("[webmcp-draft] modelContext.registerTool unavailable");\n` +
      `    return;\n` +
      `  }\n` +
      `  function callBoundOperation(toolName, args) {\n` +
      `    // Bound at publish time — execute via clawql-core source adapters in a later revision.\n` +
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

export const publishApprovedTool = (input: {
  readonly publishedBy: string;
  readonly candidateIds?: readonly string[];
}): Effect.Effect<
  PublishedWebMcpVersion,
  WebMcpDraftNotFoundError | WebMcpDraftInvalidStateError,
  DraftStoreService | AuditService
> =>
  Effect.gen(function* () {
    const store = yield* DraftStoreService;
    const audit = yield* AuditService;
    const version = yield* store.publishApproved(input);
    yield* audit.append({
      category: "webmcp-draft",
      action: "WEBMCP_DRAFT_PUBLISHED",
      summary: `Published ${version.publishedTools.length} tool(s) as ${version.versionId}`,
      correlationId: version.versionId,
    });
    return version;
  });
