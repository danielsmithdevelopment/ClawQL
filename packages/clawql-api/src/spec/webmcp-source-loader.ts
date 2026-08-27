/**
 * Load WebMCP page tools as searchable/executable operations (WebMCP-as-source).
 * Pages register tools via `navigator.modelContext.registerTool()`; Core discovers
 * them over CDP and proxies execute calls back into the browser.
 *
 * @see https://webmachinelearning.github.io/webmcp/
 */

import { Effect } from "effect";
import type { Operation } from "./operation-types.js";
import { normalizeOperationId } from "./spec-kind.js";
import type { CustomSourceEntry } from "./custom-sources-types.js";
import {
  discoverWebmcpToolsEffect,
  openWebmcpPageSessionEffect,
  resolveWebmcpCdpUrl,
} from "../webmcp/webmcp-browser.js";
import { registerWebmcpSourceBinding } from "./webmcp-source-registry.js";

function toolToOperation(
  entry: CustomSourceEntry,
  toolName: string,
  description: string
): Operation {
  const id = normalizeOperationId("webmcp", entry.id, toolName);
  return {
    id,
    method: "WEBMCP",
    path: `/webmcp/${entry.id}/${toolName}`,
    flatPath: `webmcp/${entry.id}/${toolName}`,
    description: description || `WebMCP tool ${toolName} from ${entry.name}`,
    resource: entry.id,
    parameters: {
      arguments: {
        type: "object",
        location: "query",
        required: false,
        description: "JSON object passed to the page WebMCP tool",
      },
    },
    scopes: [],
    specLabel: entry.id,
    protocolKind: "webmcp",
    nativeWebmcp: {
      sourceId: entry.id,
      toolName,
      pageUrl: entry.url?.trim() ?? entry.webmcpPageUrl?.trim() ?? "",
    },
  };
}

function loadWebmcpSourceOperationsEffect(
  entries: CustomSourceEntry[]
): Effect.Effect<Operation[], Error> {
  return Effect.gen(function* () {
    const webmcpEntries = entries.filter((e) => e.kind === "webmcp");
    const ops: Operation[] = [];

    for (const entry of webmcpEntries) {
      const pageUrl = entry.url?.trim() || entry.webmcpPageUrl?.trim();
      if (!pageUrl) {
        console.error(`[spec-loader] WebMCP source "${entry.id}" skipped: missing page URL`);
        continue;
      }

      const cdpUrl = resolveWebmcpCdpUrl(entry.webmcpCdpUrl);
      const readyMs = entry.webmcpReadyMs ?? 2_000;

      const sessionResult = yield* Effect.either(
        openWebmcpPageSessionEffect({ cdpUrl, pageUrl, readyMs })
      );
      if (sessionResult._tag === "Left") {
        console.error(
          `[spec-loader] WebMCP source "${entry.id}" connect failed:`,
          sessionResult.left.message
        );
        continue;
      }

      const session = sessionResult.right;
      const toolsResult = yield* Effect.either(discoverWebmcpToolsEffect(session));
      if (toolsResult._tag === "Left") {
        console.error(
          `[spec-loader] WebMCP source "${entry.id}" discovery failed:`,
          toolsResult.left.message
        );
        yield* Effect.tryPromise({
          try: () => session.close(),
          catch: () => new Error("close failed"),
        }).pipe(Effect.catchAll(() => Effect.void));
        continue;
      }

      const tools = toolsResult.right;
      registerWebmcpSourceBinding({
        sourceId: entry.id,
        pageUrl,
        cdpUrl,
        session,
      });

      for (const tool of tools) {
        ops.push(toolToOperation(entry, tool.name, tool.description || tool.title || ""));
      }

      console.error(
        `[spec-loader] WebMCP source "${entry.id}": ${tools.length} tool(s) from ${pageUrl} via ${cdpUrl}`
      );
    }

    return ops;
  });
}

/** Load WebMCP page tools into the operation index (async host boundary). */
export async function loadWebmcpSourceOperations(
  entries: CustomSourceEntry[]
): Promise<Operation[]> {
  return Effect.runPromise(loadWebmcpSourceOperationsEffect(entries));
}
