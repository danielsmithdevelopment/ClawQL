/**
 * Ephemeral in-process KV for MCP `cache` tool (#75) — distinct from Obsidian `memory_*`.
 * LRU store + config live in `clawql-core`; this module adds MCP/Zod validation.
 */

import {
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  resetDefaultLruCacheStoreForTests,
  runCacheOperation,
} from "clawql-core";
import { z } from "zod";
import { logMcpToolShape } from "./mcp-tool-log.js";

export {
  getClawqlCacheMaxEntries,
  getClawqlCacheMaxValueBytes,
  resetDefaultLruCacheStoreForTests as resetClawqlCacheForTests,
};

export const cacheToolSchema = {
  operation: z
    .enum(["set", "get", "delete", "list", "search"])
    .describe(
      "set | get | delete | list | search — ephemeral in-process KV (LRU eviction when full); not vault memory (use memory_ingest / memory_recall to persist)."
    ),
  key: z.string().max(2048).optional().describe("Key for set, get, delete (UTF-8 string)."),
  value: z
    .string()
    .optional()
    .describe("Value for set (size capped by CLAWQL_CACHE_MAX_VALUE_BYTES)."),
  prefix: z
    .string()
    .max(2048)
    .optional()
    .describe("For list: only keys starting with this prefix (default all)."),
  query: z
    .string()
    .max(512)
    .optional()
    .describe("For search: case-insensitive substring match against keys."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("For list/search: max results (defaults: list 100, search 50)."),
};

const cacheToolInputSchema = z.object(cacheToolSchema).superRefine((data, ctx) => {
  switch (data.operation) {
    case "set": {
      if (!data.key || data.key.length < 1) {
        ctx.addIssue({ code: "custom", message: "set requires non-empty key" });
      }
      if (data.value === undefined) {
        ctx.addIssue({ code: "custom", message: "set requires value" });
      }
      break;
    }
    case "get":
    case "delete": {
      if (!data.key || data.key.length < 1) {
        ctx.addIssue({ code: "custom", message: `${data.operation} requires non-empty key` });
      }
      break;
    }
    case "list":
      break;
    case "search": {
      if (!data.query || data.query.length < 1) {
        ctx.addIssue({ code: "custom", message: "search requires non-empty query" });
      }
      break;
    }
    default:
      break;
  }
});

function jsonResponse(obj: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
  };
}

export async function handleCacheToolInput(
  params: unknown
): Promise<{ content: { type: "text"; text: string }[] }> {
  const parsed = cacheToolInputSchema.parse(params);
  logMcpToolShape("cache", {
    operation: parsed.operation,
    keyLen: parsed.key?.length,
    valueLen: parsed.value !== undefined ? parsed.value.length : undefined,
    prefixLen: parsed.prefix?.length,
    queryLen: parsed.query?.length,
    limit: parsed.limit,
  });

  switch (parsed.operation) {
    case "set":
      return jsonResponse(
        await runCacheOperation({
          operation: "set",
          key: parsed.key!,
          value: parsed.value!,
        })
      );
    case "get":
      return jsonResponse(
        await runCacheOperation({
          operation: "get",
          key: parsed.key!,
        })
      );
    case "delete":
      return jsonResponse(
        await runCacheOperation({
          operation: "delete",
          key: parsed.key!,
        })
      );
    case "list":
      return jsonResponse(
        await runCacheOperation({
          operation: "list",
          prefix: parsed.prefix,
          limit: parsed.limit,
        })
      );
    case "search":
      return jsonResponse(
        await runCacheOperation({
          operation: "search",
          query: parsed.query!,
          limit: parsed.limit,
        })
      );
  }
}
