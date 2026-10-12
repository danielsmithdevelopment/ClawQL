/**
 * Work around MCP SDK Streamable HTTP JSON-response mode retaining `_streamMapping`
 * entries after `resolveJson` (SSE mode calls `cleanup()`; JSON mode does not).
 * Sessionful multiturn otherwise grows one map entry per POST and climbs RSS on Node.
 *
 * Safe with concurrent POSTs: only removes streams no longer referenced by
 * `_requestToStreamMapping` (in-flight batches still listed there).
 */

import { Effect } from "effect";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export type JsonStreamMapEntry = {
  resolveJson?: unknown;
  controller?: unknown;
  cleanup?: () => void;
};

/** Duck-typed subset of SDK `WebStandardStreamableHTTPServerTransport` internals. */
export type WebStandardStreamMaps = {
  _enableJsonResponse?: boolean;
  _standaloneSseStreamId?: string;
  _streamMapping?: Map<string, JsonStreamMapEntry>;
  _requestToStreamMapping?: Map<unknown, string>;
};

export const pruneOrphanJsonStreamMappingsEffect = (
  web: WebStandardStreamMaps | null | undefined
): Effect.Effect<number> =>
  Effect.sync(() => {
    if (!web?._enableJsonResponse || !web._streamMapping) return 0;
    const standalone = web._standaloneSseStreamId ?? "_GET_stream";
    const active = new Set<string>();
    for (const streamId of web._requestToStreamMapping?.values() ?? []) {
      if (typeof streamId === "string") active.add(streamId);
    }
    let pruned = 0;
    for (const [id, stream] of [...web._streamMapping.entries()]) {
      if (id === standalone) continue;
      if (active.has(id)) continue;
      // JSON-mode registrations are resolveJson-only (no SSE controller).
      if (stream?.resolveJson != null && stream.controller == null) {
        if (typeof stream.cleanup === "function") stream.cleanup();
        else web._streamMapping.delete(id);
        pruned += 1;
      }
    }
    return pruned;
  });

/** Express / host boundary — run the Effect prune against a Node Streamable HTTP transport. */
export function pruneOrphanJsonStreamMappings(
  transport: StreamableHTTPServerTransport | undefined
): number {
  if (!transport) return 0;
  const web = (
    transport as unknown as { _webStandardTransport?: WebStandardStreamMaps }
  )._webStandardTransport;
  return Effect.runSync(pruneOrphanJsonStreamMappingsEffect(web));
}
