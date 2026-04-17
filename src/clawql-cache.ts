/**
 * Ephemeral in-process KV for MCP `cache` tool (#75) — distinct from Obsidian `memory_*`.
 * **LRU:** `Map` insertion order — first key is least-recently-used; `get`/`set` move entries to MRU.
 * **Not persisted:** use **`memory_ingest`** / **`memory_recall`** for durable vault memory.
 */

import { z } from "zod";
import { logMcpToolShape } from "./mcp-tool-log.js";

/** In-process store only — cleared on restart; never written to disk. */
const mem = new Map<string, string>();

/** Exported for tests — `CLAWQL_CACHE_MAX_VALUE_BYTES` (default 1 MiB, max 16 MiB, min 1). */
export function getClawqlCacheMaxValueBytes(): number {
  const v = process.env.CLAWQL_CACHE_MAX_VALUE_BYTES?.trim();
  if (!v) return 1024 * 1024;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 1024 * 1024;
  return Math.min(Math.max(n, 1), 16 * 1024 * 1024);
}

/** Exported for tests — `CLAWQL_CACHE_MAX_ENTRIES` (default 10_000, min 1, max 10M). */
export function getClawqlCacheMaxEntries(): number {
  const v = process.env.CLAWQL_CACHE_MAX_ENTRIES?.trim();
  if (!v) return 10_000;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return 10_000;
  return Math.min(Math.max(n, 1), 10_000_000);
}

/** Move key to most-recently-used (end of iteration order). */
function touchLru(key: string): void {
  const v = mem.get(key);
  if (v === undefined) return;
  mem.delete(key);
  mem.set(key, v);
}

/** Evict least-recently-used (first key) until there is room for one more distinct key. */
function evictLruUntilRoomForNewKey(maxEntries: number): number {
  let evicted = 0;
  while (mem.size >= maxEntries) {
    const lru = mem.keys().next().value as string | undefined;
    if (lru === undefined) break;
    mem.delete(lru);
    evicted++;
  }
  return evicted;
}

/** Test helper: clear all entries (allows isolated tests in one process). */
export function resetClawqlCacheForTests(): void {
  mem.clear();
}

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

  const maxV = getClawqlCacheMaxValueBytes();
  const maxEntries = getClawqlCacheMaxEntries();
  const listLimit = parsed.limit ?? 100;
  const searchLimit = parsed.limit ?? 50;

  switch (parsed.operation) {
    case "set": {
      const value = parsed.value!;
      const key = parsed.key!;
      const bytes = Buffer.byteLength(value, "utf8");
      if (bytes > maxV) {
        return jsonResponse({
          ok: false,
          error: `value size ${bytes} exceeds CLAWQL_CACHE_MAX_VALUE_BYTES (${maxV})`,
        });
      }
      const isNew = !mem.has(key);
      let evicted = 0;
      if (isNew) {
        evicted = evictLruUntilRoomForNewKey(maxEntries);
      }
      mem.delete(key);
      mem.set(key, value);
      return jsonResponse({
        ok: true,
        operation: "set",
        key,
        ...(evicted > 0 ? { evicted } : {}),
      });
    }
    case "get": {
      const key = parsed.key!;
      const v = mem.get(key);
      if (v === undefined) {
        return jsonResponse({ ok: true, hit: false, key });
      }
      touchLru(key);
      return jsonResponse({ ok: true, hit: true, key, value: v });
    }
    case "delete": {
      const key = parsed.key!;
      const existed = mem.has(key);
      mem.delete(key);
      return jsonResponse({ ok: true, operation: "delete", key, deleted: existed });
    }
    case "list": {
      const prefix = parsed.prefix ?? "";
      const keys = [...mem.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .slice(0, listLimit);
      return jsonResponse({
        ok: true,
        operation: "list",
        prefix: prefix === "" ? undefined : prefix,
        count: keys.length,
        keys,
      });
    }
    case "search": {
      const q = parsed.query!.toLowerCase();
      const keys = [...mem.keys()]
        .filter((k) => k.toLowerCase().includes(q))
        .sort()
        .slice(0, searchLimit);
      return jsonResponse({
        ok: true,
        operation: "search",
        query: parsed.query,
        count: keys.length,
        keys,
      });
    }
  }
}
