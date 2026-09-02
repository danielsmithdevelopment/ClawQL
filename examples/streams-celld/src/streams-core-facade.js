/**
 * In-cell ClawQL façade for Streams AgentSessionDO.
 *
 * In-process today (via clawql-core/streams-slim):
 * - audit append / list / verify (hash-chained ring buffer, isolate-local)
 * - cache get / set / delete / list (session scratch)
 *
 * Out-of-process via fetch(CLAWQL_MCP_URL) Streamable HTTP:
 * - search / execute / memory_* → clawql-mcp
 *
 * Out-of-process via fetch(CLAWQL_MCP_ADAPTER_URL) REST:
 * - POST /{tool} → mcp-api-adapter (protocol fan-out host; not embedded)
 *
 * Still deferred:
 * - inference completions → fetch(INFERENCE_URL)
 */

import {
  runAuditOperation,
  runCacheOperation,
} from "clawql-core/streams-slim";
import { callAdapterTool } from "./adapter-fetch.js";
import { callMcpTool } from "./mcp-fetch.js";

/**
 * @param {{ subscriptionId: string, eventId: string, doInstanceId: string, virtualKeyId: string }} ctx
 */
export async function appendSessionCreatedAudit(ctx) {
  const result = await runAuditOperation({
    operation: "append",
    category: "streams",
    action: "session_created",
    summary: `AgentSessionDO spawned for ${ctx.subscriptionId}`,
    correlationId: ctx.eventId,
  });
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : { ok: false };
}

/**
 * @param {string} eventId
 * @param {unknown} meta
 */
export async function cacheSessionMeta(eventId, meta) {
  const key = `streams:session:${eventId}`;
  const result = await runCacheOperation({
    operation: "set",
    key,
    value: JSON.stringify(meta),
  });
  return { key, ...result };
}

/**
 * @param {{ url?: string, bearer?: string }} mcp
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export async function searchViaMcp(mcp, query, opts = {}) {
  return callMcpTool(
    { url: mcp.url ?? "", bearer: mcp.bearer },
    "search",
    { query, limit: opts.limit ?? 5 }
  );
}

/**
 * @param {{ url?: string, bearer?: string }} mcp
 * @param {string} operationId
 * @param {Record<string, unknown>} [args]
 */
export async function executeViaMcp(mcp, operationId, args = {}) {
  return callMcpTool(
    { url: mcp.url ?? "", bearer: mcp.bearer },
    "execute",
    { operationId, args }
  );
}

/**
 * Persist a short vault note via host memory_ingest (MCP).
 * @param {{ url?: string, bearer?: string }} mcp
 * @param {{ title: string, insights: string, sessionId?: string, type?: string, tags?: string[] }} input
 */
export async function memoryIngestViaMcp(mcp, input) {
  return callMcpTool(
    { url: mcp.url ?? "", bearer: mcp.bearer },
    "memory_ingest",
    {
      title: input.title,
      insights: input.insights,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    }
  );
}

/**
 * Recall vault context via host memory_recall (MCP).
 * @param {{ url?: string, bearer?: string }} mcp
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export async function memoryRecallViaMcp(mcp, query, opts = {}) {
  return callMcpTool(
    { url: mcp.url ?? "", bearer: mcp.bearer },
    "memory_recall",
    { query, limit: opts.limit ?? 5 }
  );
}

/**
 * Protocol-fabric REST probe via mcp-api-adapter (POST /{tool}).
 * @param {{ url?: string, bearer?: string }} adapter
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
export async function toolViaAdapter(adapter, name, args = {}) {
  return callAdapterTool(
    { url: adapter.url ?? "", bearer: adapter.bearer },
    name,
    args
  );
}

export async function verifyAuditChain() {
  const result = await runAuditOperation({ operation: "verify" });
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : { ok: false };
}

/**
 * Snapshot the in-process hash-chained audit ring (for DO LTX flush).
 * @param {number} [limit]
 */
export async function listAuditEntries(limit = 50) {
  const result = await runAuditOperation({ operation: "list", limit });
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : { ok: false, entries: [] };
}
