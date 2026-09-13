/**
 * Ephemeral in-process KV for MCP `cache` tool (#75) — distinct from Obsidian `memory_*`.
 * LRU store + Effect Schema live in `clawql-core`; this module is the MCP Promise façade.
 */

import {
  decodeCacheInput,
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  resetDefaultLruCacheStoreForTests,
  runCacheOperation,
} from "clawql-core";
import { Effect } from "effect";
import { logMcpToolShape } from "./mcp-tool-log.js";

export {
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  resetDefaultLruCacheStoreForTests as resetClawqlCacheForTests,
};

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

export async function handleCacheToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = await Effect.runPromise(decodeCacheInput(params));
  logMcpToolShape("cache", {
    operation: parsed.operation,
    keyLen: "key" in parsed ? parsed.key.length : undefined,
    valueLen: parsed.operation === "set" ? parsed.value.length : undefined,
    prefixLen: parsed.operation === "list" ? parsed.prefix?.length : undefined,
    queryLen: parsed.operation === "search" ? parsed.query.length : undefined,
    limit: "limit" in parsed ? parsed.limit : undefined,
  });
  return jsonResponse(await runCacheOperation(parsed));
}
