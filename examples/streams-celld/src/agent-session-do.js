/**
 * AgentSessionDO — ephemeral session with in-cell clawql-core (streams-slim)
 * plus optional fetch(CLAWQL_MCP_URL) and fetch(CLAWQL_MCP_ADAPTER_URL).
 * Model calls use fetch(INFERENCE_URL) — never child_process.
 */
import {
  appendSessionCreatedAudit,
  cacheSessionMeta,
  executeViaMcp,
  listAuditEntries,
  memoryIngestViaMcp,
  memoryRecallViaMcp,
  searchViaMcp,
  toolViaAdapter,
  verifyAuditChain,
} from "./streams-core-facade.js";

function resolveMcpConfig(env) {
  const url =
    (env.CLAWQL_MCP_URL || env.CLAWQL_MCP_HTTP_URL || "").trim() || undefined;
  const bearer = (env.CLAWQL_MCP_BEARER_TOKEN || "").trim() || undefined;
  return { url, bearer };
}

function resolveAdapterConfig(env) {
  const url = (env.CLAWQL_MCP_ADAPTER_URL || "").trim() || undefined;
  const bearer =
    (env.CLAWQL_MCP_ADAPTER_BEARER_TOKEN || env.CLAWQL_MCP_BEARER_TOKEN || "")
      .trim() || undefined;
  return { url, bearer };
}

function resolveInferenceUrl(env) {
  return (
    (env.INFERENCE_URL || env.CLAWQL_STREAMS_INFERENCE_URL || "").trim() ||
    undefined
  );
}

/**
 * Flush the isolate-local clawql-core audit ring into DO durable storage (LTX).
 * Snapshot at audit:ring; per-seq WORM rows at audit:seq:{n}.
 * @param {{ storage: { put: (k: string, v: unknown) => Promise<void> } }} state
 * @param {{ verify?: unknown, eventId: string, startedAt: number }} ctx
 */
async function persistAuditRingToLtx(state, ctx) {
  const listed = await listAuditEntries(50);
  const entries = Array.isArray(listed?.entries) ? listed.entries : [];
  const snapshot = {
    ok: listed?.ok === true,
    total: listed?.total ?? entries.length,
    maxEntries: listed?.maxEntries,
    verify: ctx.verify ?? null,
    eventId: ctx.eventId,
    flushedAt: Date.now(),
    startedAt: ctx.startedAt,
    entries,
  };
  await state.storage.put("audit:ring", snapshot);
  const seqKeys = [];
  for (const entry of entries) {
    const seq = entry?.seq;
    if (typeof seq !== "number") continue;
    const key = `audit:seq:${seq}`;
    await state.storage.put(key, {
      ...entry,
      eventId: ctx.eventId,
      flushedAt: snapshot.flushedAt,
    });
    seqKeys.push(key);
  }
  return {
    ok: true,
    snapshotKey: "audit:ring",
    seqKeys,
    entryCount: entries.length,
    headHash: entries.length ? entries[entries.length - 1]?.hash : null,
  };
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
      let auditPersisted = { ok: false };
      try {
        audit = await appendSessionCreatedAudit({
          subscriptionId,
          eventId,
          doInstanceId,
          virtualKeyId,
        });
        cache = await cacheSessionMeta(eventId, meta);
        auditVerify = await verifyAuditChain();
        auditPersisted = await persistAuditRingToLtx(this.state, {
          verify: auditVerify,
          eventId,
          startedAt,
        });
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
      const adapter = resolveAdapterConfig(this.env);
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
        adapter_search: await toolViaAdapter(adapter, "search", {
          query: `adapter:${subscriptionId}`,
          limit: 1,
        }),
      };

      const outOfProcess = ["inference"];
      if (mcp.url) outOfProcess.unshift("search", "execute", "memory_*");
      if (adapter.url) outOfProcess.push("mcp-api-adapter");

      const deferred = [];
      if (!mcp.url) deferred.push("search", "execute", "memory_*");
      if (!adapter.url) deferred.push("mcp-api-adapter");

      await this.state.storage.put(`tool_calls:${startedAt}`, {
        searchOk: tools.search?.ok === true,
        executeOk: tools.execute?.ok === true,
        memoryIngestOk: tools.memory_ingest?.ok === true,
        memoryRecallOk: tools.memory_recall?.ok === true,
        adapterSearchOk: tools.adapter_search?.ok === true,
        mcpDeferred: !mcp.url,
        adapterDeferred: !adapter.url,
      });

      return Response.json({
        do: "AgentSessionDO",
        session: meta,
        inference,
        audit: {
          wormKey: `worm:${startedAt}`,
          clawqlCore: audit,
          verify: auditVerify,
          ltx: auditPersisted,
        },
        cache,
        tools,
        core: {
          package: "clawql-core/streams-slim",
          inProcess: ["audit", "cache", "hash-chain"],
          durable: ["audit:ring", "audit:seq:*", "worm:*"],
          outOfProcess,
          deferred,
          mcpUrlConfigured: Boolean(mcp.url),
          adapterUrlConfigured: Boolean(adapter.url),
        },
      });
    }

    const meta = await this.state.storage.get("session_meta");
    const auditRing = await this.state.storage.get("audit:ring");
    return Response.json({
      do: "AgentSessionDO",
      session: meta ?? null,
      auditRing: auditRing ?? null,
    });
  }
}
