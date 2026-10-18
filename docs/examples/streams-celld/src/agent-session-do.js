/**
 * AgentSessionDO — ephemeral session with in-cell clawql-core (streams-slim)
 * plus optional fetch(CLAWQL_MCP_URL) and fetch(CLAWQL_MCP_ADAPTER_URL).
 * Model calls use fetch(INFERENCE_URL) — never child_process.
 *
 * Compliance: when CLAWQL_AUDIT_WORM_URL is set, SESSION_START must land on host
 * clawql-audit or spawn fails closed (no silent ring-only degrade).
 */
import {
  appendComplianceWorm,
  appendSessionCreatedAudit,
  cacheSessionMeta,
  coreInCelldEnabled,
  executeViaMcp,
  listAuditEntries,
  memoryIngestViaMcp,
  memoryRecallViaMcp,
  searchViaMcp,
  toolViaAdapter,
  verifyAuditChain,
} from "./streams-core-facade.js";
import { requireComplianceWorm } from "./worm-fetch.js";

function resolveMcpConfig(env) {
  const url =
    (env.CLAWQL_MCP_URL || env.CLAWQL_MCP_HTTP_URL || "").trim() || undefined;
  const bearer = (env.CLAWQL_MCP_BEARER_TOKEN || "").trim() || undefined;
  const preferCoreInCelld = coreInCelldEnabled(env);
  return {
    url,
    bearer,
    preferCoreInCelld,
    coreTools: preferCoreInCelld ? env.CORE_TOOLS : undefined,
  };
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

function resolveWormConfig(env) {
  const url = (env.CLAWQL_AUDIT_WORM_URL || "").trim() || undefined;
  const apiKey =
    (env.CLAWQL_AUDIT_API_KEY || env.CLAWQL_WORM_API_KEY || "").trim() ||
    undefined;
  return { url, apiKey };
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

  /** Streams §3.5 — hard TTL via setAlarm (no setInterval on celld). */
  async alarm() {
    const intent = await this.state.storage.get("alarm_intent");
    const meta = await this.state.storage.get("session_meta");
    if (!meta || typeof meta !== "object") return;
    if (meta.exitReason) return;
    if (intent?.kind === "session_ttl" || !intent) {
      const closed = {
        ...meta,
        exitReason: "timeout",
        closedAt: Date.now(),
      };
      await this.state.storage.put("session_meta", closed);
      await this.state.storage.put("alarm_fired", {
        at: Date.now(),
        kind: "session_ttl",
      });
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/start") && request.method === "POST") {
      const subscriptionId = request.headers.get("x-subscription-id") ?? "unknown";
      const eventId = request.headers.get("x-event-id") ?? crypto.randomUUID();
      const startedAt = Date.now();
      const doInstanceId = crypto.randomUUID();
      const virtualKeyId = `vk_lab_${eventId.slice(0, 8)}`;
      const ttlMsRaw = Number(
        request.headers.get("x-clawql-session-ttl-ms") ||
          this.env.CLAWQL_SESSION_TTL_MS ||
          0
      );
      const ttlMs =
        Number.isFinite(ttlMsRaw) && ttlMsRaw > 0 ? Math.min(ttlMsRaw, 3_600_000) : 0;

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
        ttlMs: ttlMs || null,
      };

      // All durable DO writes before outbound fetch() — avoids celld NodeFenced
      // when storage mutates after a network hop (output / durability gate).
      await this.state.storage.put("session_meta", meta);
      await this.state.storage.put(`worm:${startedAt}`, {
        kind: "DO_CREATED",
        doInstanceId,
        virtualKeyId,
        subscriptionId,
        eventId,
      });
      if (ttlMs > 0) {
        await this.state.storage.put("alarm_intent", {
          kind: "session_ttl",
          ttlMs,
          scheduledAt: startedAt,
        });
        await this.state.storage.setAlarm(startedAt + ttlMs);
      }

      let audit = { ok: false };
      let cache = { ok: false };
      let auditVerify = { ok: false };
      let auditPersisted = { ok: false, deferred: true };
      let complianceWorm = { deferred: true };
      const wormCfg = resolveWormConfig(this.env);

      // In-process ring/cache only — DO LTX flush is deferred until AFTER all
      // outbound fetches (celld output gate: storage.put mid-handler fences later fetch).
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

      try {
        // Compliance trail: host clawql-audit (tip-load). Ring/LTX is bookkeeping only.
        complianceWorm = await appendComplianceWorm(wormCfg, {
          type: "SESSION_START",
          sessionId: eventId,
          agentName: "streams-celld-AgentSessionDO",
          virtualKeyId,
          cellId: doInstanceId,
          metadata: {
            subscriptionId,
            eventId,
            kind: "DO_CREATED",
            source: "streams-celld",
          },
        });
      } catch (err) {
        complianceWorm = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      const complianceGate = requireComplianceWorm(wormCfg, complianceWorm);
      if (!complianceGate.ok) {
        // Fail closed: clear session_meta so a retry can re-attempt compliance.
        // Do not continue tools as if the session were audited.
        await this.state.storage.delete("session_meta");
        return Response.json(
          {
            do: "AgentSessionDO",
            ok: false,
            error: "compliance_worm_required",
            message:
              complianceGate.error ||
              "host clawql-audit unreachable — refusing ring-only SESSION_START",
            session: { eventId, subscriptionId, doInstanceId, virtualKeyId },
            audit: {
              clawqlCore: audit,
              verify: auditVerify,
              ltx: auditPersisted,
              compliance: complianceWorm,
            },
            core: {
              package: "clawql-core/streams-slim",
              wormUrlConfigured: Boolean(wormCfg.url),
              failClosed: true,
            },
          },
          { status: 503 }
        );
      }

      // All outbound fetches before any further storage.put (celld durability gate).
      // Fan-out tools+inference in ONE Promise.all wave: a later sequential fetch
      // after prior hops complete is NodeFenced under celld's output gate (even
      // with no explicit mid-handler storage.put).
      const mcp = resolveMcpConfig(this.env);
      const adapter = resolveAdapterConfig(this.env);
      const memoryTitle = `streams-celld session ${eventId.slice(0, 8)}`;
      const inferenceUrl = resolveInferenceUrl(this.env);

      async function runInferenceProbe() {
        if (!inferenceUrl) {
          return { skipped: true, reason: "no INFERENCE_URL" };
        }
        const base = inferenceUrl.replace(/\/$/, "");
        try {
          // Kick both hops without awaiting between them so healthz+turn share
          // the same output-gate window as sibling tool fetches.
          const healthP = fetch(`${base}/healthz`, {
            method: "GET",
            headers: { accept: "application/json" },
          });
          const turnP = fetch(`${base}/v1/messages`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
              authorization: `Bearer ${virtualKeyId}`,
            },
            body: JSON.stringify({
              model: "stub-frugal",
              prompt: `streams session ${eventId} subscription ${subscriptionId}`,
              max_tokens: 64,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const [health, turnRes] = await Promise.all([healthP, turnP]);
          const turnText = await turnRes.text();
          let turnBody = null;
          try {
            turnBody = turnText ? JSON.parse(turnText) : null;
          } catch {
            turnBody = { raw: turnText.slice(0, 300) };
          }
          return {
            skipped: false,
            ok: health.ok && turnRes.ok,
            healthz: { status: health.status, ok: health.ok },
            turn: {
              status: turnRes.status,
              ok: turnRes.ok,
              id: turnBody?.id ?? null,
              turn: turnBody?.turn ?? 1,
              source: turnBody?.source ?? null,
            },
            turns: turnRes.ok ? 1 : 0,
          };
        } catch (err) {
          return {
            skipped: false,
            ok: false,
            turns: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      const [search, execute, memory_ingest, memory_recall, adapter_search, inference] =
        await Promise.all([
          searchViaMcp(
            mcp,
            mcp.preferCoreInCelld
              ? "listPets pets openapi"
              : `subscription:${subscriptionId}`,
            { limit: 3 }
          ),
          // Prefer in-cell noop (no upstream). listPets REST is exercised via Worker POST /mcp.
          executeViaMcp(mcp, "streams.session.noop", { eventId }),
          memoryIngestViaMcp(mcp, {
            title: memoryTitle,
            insights: `AgentSessionDO spawned subscription=${subscriptionId} event=${eventId}`,
            sessionId: eventId,
            type: "context",
            tags: ["streams", "celld"],
          }),
          memoryRecallViaMcp(mcp, `streams-celld ${subscriptionId}`, {
            limit: 3,
          }),
          toolViaAdapter(adapter, "search", {
            query: `adapter:${subscriptionId}`,
            limit: 1,
          }),
          runInferenceProbe(),
        ]);
      const tools = {
        search,
        execute,
        memory_ingest,
        memory_recall,
        adapter_search,
      };

      const inProcess = ["audit", "cache", "hash-chain"];
      if (mcp.preferCoreInCelld) inProcess.push("search", "execute");

      const outOfProcess = ["inference"];
      if (mcp.url && !mcp.preferCoreInCelld) {
        outOfProcess.unshift("search", "execute", "memory_*");
      } else if (mcp.url) {
        outOfProcess.unshift("memory_*");
      }
      if (adapter.url) outOfProcess.push("mcp-api-adapter");
      if (wormCfg.url) outOfProcess.push("clawql-audit-worm");

      const deferred = [];
      if (!mcp.preferCoreInCelld && !mcp.url) deferred.push("search", "execute", "memory_*");
      else if (mcp.preferCoreInCelld && !mcp.url) deferred.push("memory_*");
      if (!adapter.url) deferred.push("mcp-api-adapter");
      if (!wormCfg.url) deferred.push("clawql-audit-worm");

      // Final durable writes only after all outbound fetches (celld output gate).
      // Include deferred LTX audit ring flush here — never mid-handler before fetch.
      try {
        auditPersisted = await persistAuditRingToLtx(this.state, {
          verify: auditVerify,
          eventId,
          startedAt,
        });
      } catch (err) {
        auditPersisted = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      if (inference && inference.skipped === false) {
        await this.state.storage.put("inference_probe", inference);
        await this.state.storage.put(`worm:inference:${startedAt}`, {
          kind: "INFERENCE_TURN",
          virtualKeyId,
          eventId,
          ok: inference.ok === true,
          inferenceId: inference.turn?.id ?? null,
        });
      }
      await this.state.storage.put(`tool_calls:${startedAt}`, {
        searchOk: tools.search?.ok === true,
        executeOk: tools.execute?.ok === true,
        memoryIngestOk: tools.memory_ingest?.ok === true,
        memoryRecallOk: tools.memory_recall?.ok === true,
        adapterSearchOk: tools.adapter_search?.ok === true,
        complianceWormOk: complianceWorm?.ok === true,
        mcpDeferred: !mcp.url,
        adapterDeferred: !adapter.url,
        wormDeferred: !wormCfg.url,
      });

      return Response.json({
        do: "AgentSessionDO",
        session: meta,
        alarm: ttlMs > 0 ? { kind: "session_ttl", ttlMs, scheduled: true } : { scheduled: false },
        inference,
        audit: {
          wormKey: `worm:${startedAt}`,
          clawqlCore: audit,
          verify: auditVerify,
          ltx: auditPersisted,
          /** Host clawql-audit (compliance). Ring/LTX above is DO bookkeeping only. */
          compliance: complianceWorm,
        },
        cache,
        tools,
        core: {
          package: "clawql-core/streams-slim",
          inProcess,
          durable: ["audit:ring", "audit:seq:*", "worm:*", "CoreToolsDO", "alarm_intent"],
          outOfProcess,
          deferred,
          coreInCelld: Boolean(mcp.preferCoreInCelld),
          mcpUrlConfigured: Boolean(mcp.url),
          adapterUrlConfigured: Boolean(adapter.url),
          wormUrlConfigured: Boolean(wormCfg.url),
        },
      });
    }

    const meta = await this.state.storage.get("session_meta");
    const auditRing = await this.state.storage.get("audit:ring");
    const alarmFired = await this.state.storage.get("alarm_fired");
    return Response.json({
      do: "AgentSessionDO",
      session: meta ?? null,
      auditRing: auditRing ?? null,
      alarmFired: alarmFired ?? null,
    });
  }
}
