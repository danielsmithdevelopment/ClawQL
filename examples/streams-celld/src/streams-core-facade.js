/**
 * In-cell ClawQL core façade for Streams AgentSessionDO.
 *
 * In-process today (via clawql-core/streams-slim):
 * - audit append / list / verify (hash-chained ring buffer, isolate-local)
 * - cache get / set / delete / list (session scratch)
 *
 * Deferred / out-of-process (not in clawql-core):
 * - search / execute → clawql-api + MCP host (or fetch to clawql-mcp)
 * - memory_ingest / memory_recall → clawql-memory + vault
 * - inference completions → fetch(INFERENCE_URL) (already out-of-process)
 * - mcp-api-adapter protocol surfaces → Node Express/gRPC host
 */

import {
  runAuditOperation,
  runCacheOperation,
} from "clawql-core/streams-slim";

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
 * @param {string} query
 */
export async function searchDeferred(query) {
  return {
    deferred: true,
    tool: "search",
    reason:
      "clawql-api is Node-hosted; call via fetch→MCP or wait for streams-slim API",
    query,
  };
}

/**
 * @param {string} operationId
 * @param {unknown} args
 */
export async function executeDeferred(operationId, args) {
  return {
    deferred: true,
    tool: "execute",
    reason: "clawql-api execute stays out-of-process on celld path",
    operationId,
    args,
  };
}

export async function verifyAuditChain() {
  const result = await runAuditOperation({ operation: "verify" });
  const text = result.content?.[0]?.text;
  return text ? JSON.parse(text) : { ok: false };
}
