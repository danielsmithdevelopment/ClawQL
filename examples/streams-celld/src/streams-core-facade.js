/**
 * In-cell ClawQL façade for Streams AgentSessionDO.
 *
 * In-process today (via clawql-core/streams-slim):
 * - audit append / list / verify (hash-chained ring buffer, isolate-local)
 * - cache get / set / delete / list (session scratch)
 *
 * Out-of-process via fetch(CLAWQL_MCP_URL) Streamable HTTP:
 * - search / execute → clawql-mcp (clawql-api on the host)
 *
 * Still deferred:
 * - memory_ingest / memory_recall → clawql-memory + vault (or MCP when enabled)
 * - inference completions → fetch(INFERENCE_URL)
 * - mcp-api-adapter protocol surfaces → Node Express/gRPC host
 */

import {
  runAuditOperation,
  runCacheOperation,
} from "clawql-core/streams-slim";
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

export async function verifyAuditChain() {
  const result = await runAuditOperation({ operation: "verify" });
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : { ok: false };
}
