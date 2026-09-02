/**
 * AgentSessionDO — ephemeral session with in-cell clawql-core (streams-slim)
 * plus optional fetch(CLAWQL_MCP_URL) for search/execute/memory_*.
 * Model calls use fetch(INFERENCE_URL) — never child_process.
 */
import {
  appendSessionCreatedAudit,
  cacheSessionMeta,
  executeViaMcp,
  memoryIngestViaMcp,
  memoryRecallViaMcp,
  searchViaMcp,
  verifyAuditChain,
} from "./streams-core-facade.js";

function resolveMcpConfig(env) {
  const url =
    (env.CLAWQL_MCP_URL || env.CLAWQL_MCP_HTTP_URL || "").trim() || undefined;
  const bearer = (env.CLAWQL_MCP_BEARER_TOKEN || "").trim() || undefined;
  return { url, bearer };
}

function resolveInferenceUrl(env) {
  return (
    (env.INFERENCE_URL || env.CLAWQL_STREAMS_INFERENCE_URL || "").trim() ||
    undefined
  );
}

export class AgentSessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/start") && request.method === "POST") {
      const subscriptionId = request.headers.get("x-subscription-id") ?? "unknown";
      const eventId = request.headers.get("x-event-id") ?? crypto.randomUUID();
      const startedAt = Date.now();
      const doInstanceId = crypto.randomUUID();
      const virtualKeyId = `vk_lab_${eventId.slice(0, 8)}`;

      const existing = await this.state.storage.get("session_meta");
      if (existing) {
        return Response.json({
          do: "AgentSessionDO",
          idempotent: true,
          session: existing,
          core: { clawqlCore: "streams-slim", note: "idempotent wake — no re-audit" },
        });
      }

      const meta = {
        doInstanceId,
        subscriptionId,
        eventId,
        virtualKeyId,
        startedAt,
        exitReason: null,
      };
      await this.state.storage.put("session_meta", meta);
      await this.state.storage.put(`worm:${startedAt}`, {
        kind: "DO_CREATED",
        doInstanceId,
        virtualKeyId,
        subscriptionId,
        eventId,
      });

      let audit = { ok: false };
      let cache = { ok: false };
      let auditVerify = { ok: false };
      try {
        audit = await appendSessionCreatedAudit({
          subscriptionId,
          eventId,
          doInstanceId,
          virtualKeyId,
        });
        cache = await cacheSessionMeta(eventId, meta);
        auditVerify = await verifyAuditChain();
      } catch (err) {
        audit = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      let inference = { skipped: true, reason: "no INFERENCE_URL" };
      const inferenceUrl = resolveInferenceUrl(this.env);
      if (inferenceUrl) {
        try {
          const res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/healthz`, {
            method: "GET",
            headers: { accept: "application/json" },
          });
          inference = {
            skipped: false,
            status: res.status,
            ok: res.ok,
          };
          await this.state.storage.put("inference_probe", inference);
        } catch (err) {
          inference = {
            skipped: false,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      const mcp = resolveMcpConfig(this.env);
      const memoryTitle = `streams-celld session ${eventId.slice(0, 8)}`;
      const tools = {
        search: await searchViaMcp(mcp, `subscription:${subscriptionId}`, {
          limit: 3,
        }),
        execute: await executeViaMcp(mcp, "streams.session.noop", { eventId }),
        memory_ingest: await memoryIngestViaMcp(mcp, {
          title: memoryTitle,
          insights: `AgentSessionDO spawned subscription=${subscriptionId} event=${eventId}`,
          sessionId: eventId,
          type: "context",
          tags: ["streams", "celld"],
        }),
        memory_recall: await memoryRecallViaMcp(
          mcp,
          `streams-celld ${subscriptionId}`,
          { limit: 3 }
        ),
      };
      await this.state.storage.put(`tool_calls:${startedAt}`, {
        searchOk: tools.search?.ok === true,
        executeOk: tools.execute?.ok === true,
        memoryIngestOk: tools.memory_ingest?.ok === true,
        memoryRecallOk: tools.memory_recall?.ok === true,
        deferred: !mcp.url,
      });

      return Response.json({
        do: "AgentSessionDO",
        session: meta,
        inference,
        audit: {
          wormKey: `worm:${startedAt}`,
          clawqlCore: audit,
          verify: auditVerify,
        },
        cache,
        tools,
        core: {
          package: "clawql-core/streams-slim",
          inProcess: ["audit", "cache", "hash-chain"],
          outOfProcess: mcp.url
            ? ["search", "execute", "memory_*", "inference"]
            : ["inference"],
          deferred: mcp.url
            ? ["mcp-api-adapter"]
            : ["search", "execute", "memory_*", "mcp-api-adapter"],
          mcpUrlConfigured: Boolean(mcp.url),
        },
      });
    }

    const meta = await this.state.storage.get("session_meta");
    return Response.json({ do: "AgentSessionDO", session: meta ?? null });
  }
}
