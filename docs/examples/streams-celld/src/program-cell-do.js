/**
 * ProgramCellDO — in-isolate durable program journal (ADR 0015).
 *
 * Honesty: journals plan steps in DO SQLite/LTX (celld). Proves resume after
 * SIGKILL of the celld binary for this DO's storage. Not fleet multi-node LTX
 * and not the host file-journal stand-in (see kill-node-standin-demo).
 *
 * Contract (same as durable-runner):
 * - completed calls → journal entry (replay, do not re-run)
 * - write: put intent before host call; intent without entry → outcome_unknown
 * - interrupted read (no entry) → re-run once
 */

import { CORE_IN_CELLD_HONESTY, resolveSlimExecute } from "./core-catalog.js";
import {
  decideCallResume,
  entryMatchesCall,
  isWriteCall,
  journaledArgs,
  nondetAwaitApprovalKey,
} from "./program-cell-resume.js";

export const PROGRAM_CELL_HONESTY =
  "ProgramCellDO: durable plan journal in celld DO storage (LTX). SIGKILL of celld binary + resume proves isolate crash survival for this journal — not fleet diagnose, not host file-journal stand-in.";

export { decideCallResume, entryMatchesCall, isWriteCall } from "./program-cell-resume.js";

function metaKey(programId) {
  return `program:${programId}:meta`;
}
function entryKey(programId, index) {
  return `program:${programId}:entry:${index}`;
}
function intentKey(programId, index) {
  return `program:${programId}:intent:${index}`;
}
function nondetKey(programId, key) {
  return `program:${programId}:nondet:${key}`;
}

/**
 * Observe-only mandate status from CLAWQL_CORE_UPSTREAM mock/store.
 * @returns {Promise<string | null>}
 */
async function fetchPendingStatus(upstream, executionId) {
  const base = String(upstream || "").replace(/\/$/, "");
  if (!base || !executionId) return null;
  try {
    const res = await fetch(`${base}/__pending/${encodeURIComponent(executionId)}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status === 404) return null;
    const body = await res.json().catch(() => null);
    if (!res.ok) return null;
    return typeof body?.status === "string" ? body.status : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined} upstream
 * @param {{ operationId: string, method?: string, path?: string, args?: Record<string, unknown> }} call
 */
async function executeCall(upstream, call) {
  const resolved = resolveSlimExecute(call.operationId, call.args || {});
  if (!resolved?.ok || !resolved.op) {
    return {
      ok: false,
      status: "error",
      error: resolved?.error || `unknown operation ${call.operationId}`,
      value: null,
    };
  }
  const op = resolved.op;
  if (op.operationId === "streams.session.noop") {
    return {
      ok: true,
      status: "ok",
      value: { status: "noop", inCell: true, operationId: call.operationId },
    };
  }
  const method = call.method || op.method || "GET";
  const path = call.path || op.path;
  if (!path) {
    return {
      ok: false,
      status: "error",
      error: `no path for ${call.operationId}`,
      value: null,
    };
  }
  const base = String(upstream || "").replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      status: "error",
      error: "CLAWQL_CORE_UPSTREAM unset",
      value: null,
    };
  }
  const hangMs = Number(call.args?.hangMs || 0);
  const timeoutMs = hangMs > 0 ? Math.min(120_000, hangMs + 5_000) : 10_000;
  const qs =
    hangMs > 0
      ? `${path.includes("?") ? "&" : "?"}hangMs=${encodeURIComponent(String(hangMs))}`
      : "";
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}${qs}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(call.args?.idempotencyKey
          ? { "idempotency-key": String(call.args.idempotencyKey) }
          : {}),
      },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(call.args || {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 300) };
    }
    return {
      ok: res.ok,
      status: res.ok ? "ok" : "error",
      error: res.ok ? undefined : `upstream ${res.status}`,
      value: { status: res.status, body, operationId: call.operationId },
    };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      value: null,
    };
  }
}

export class ProgramCellDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Claim-path §2/§4 — observe-only await_approval. Journals executionId nondet;
   * parks while pending; lands once settled. Never consumes.
   * @returns {Promise<{ done: true, response: Response } | { done: false, entry: object }>}
   */
  async runAwaitApprovalStep(programId, call, index, results, meta) {
    const executionId = typeof call.executionId === "string" ? call.executionId.trim() : "";
    if (!executionId.startsWith("pex_")) {
      const entry = {
        index,
        callId: `c${index}`,
        tool: "await_approval",
        args: journaledArgs(call),
        result: {
          ok: false,
          status: "invalid_execution_id",
          error: "await_approval requires executionId pex_…",
          value: null,
        },
        completedAt: new Date().toISOString(),
        replayed: false,
      };
      await this.state.storage.put(entryKey(programId, index), entry);
      meta.status = "failed";
      meta.lastError = entry.result.error;
      meta.updatedAt = new Date().toISOString();
      await this.state.storage.put(metaKey(programId), meta);
      return {
        done: true,
        response: Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: [...results, entry],
          honesty: PROGRAM_CELL_HONESTY,
        }),
      };
    }

    const waitKey = nondetAwaitApprovalKey(index);
    const nondetStorageKey = nondetKey(programId, waitKey);
    const journaledId = await this.state.storage.get(nondetStorageKey);
    if (journaledId === undefined || journaledId === null) {
      await this.state.storage.put(nondetStorageKey, executionId);
    } else if (journaledId !== executionId) {
      meta.status = "failed";
      meta.lastError = "journal_divergence";
      meta.updatedAt = new Date().toISOString();
      await this.state.storage.put(metaKey(programId), meta);
      return {
        done: true,
        response: Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: results,
          journalDivergence: true,
          diagnostics: {
            code: "journal_divergence",
            index,
            message: "journaled await_approval executionId does not match the plan call",
          },
          honesty: PROGRAM_CELL_HONESTY,
        }),
      };
    }

    const status = await fetchPendingStatus(this.env.CLAWQL_CORE_UPSTREAM, executionId);
    if (status === "pending") {
      meta.status = "parked";
      meta.pausedAtIndex = index;
      meta.pauseKind = "await_approval";
      meta.updatedAt = new Date().toISOString();
      await this.state.storage.put(metaKey(programId), meta);
      return {
        done: true,
        response: Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: "parked",
          code: "awaiting_approval",
          pauseKind: "await_approval",
          pausedAtIndex: index,
          executionId,
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "Observe-only wait; approve/decline then POST /program/resume (never consumes)",
        }),
      };
    }

    const terminalOk = status === "approved" || status === "completed";
    const callStatus = status === null ? "mandate_missing" : status;
    const entry = {
      index,
      callId: `c${index}`,
      tool: "await_approval",
      args: { executionId },
      result: {
        ok: terminalOk,
        status: callStatus,
        error: terminalOk
          ? undefined
          : status === null
            ? `pending execution ${executionId} not found`
            : `mandate ${status}`,
        value: {
          ok: terminalOk,
          status: callStatus,
          executionId,
          pendingStatus: status,
        },
      },
      completedAt: new Date().toISOString(),
      replayed: false,
    };
    await this.state.storage.put(entryKey(programId, index), entry);
    if (!terminalOk) {
      meta.status = "failed";
      meta.lastError = entry.result.error;
      meta.updatedAt = new Date().toISOString();
      await this.state.storage.put(metaKey(programId), meta);
      return {
        done: true,
        response: Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: [...results, entry],
          honesty: PROGRAM_CELL_HONESTY,
        }),
      };
    }
    // Clear park markers once settled.
    if (meta.pauseKind === "await_approval") {
      delete meta.pauseKind;
      delete meta.pausedAtIndex;
    }
    meta.status = "running";
    meta.updatedAt = new Date().toISOString();
    await this.state.storage.put(metaKey(programId), meta);
    return { done: false, entry };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/health") && request.method === "GET") {
      return Response.json({
        ok: true,
        do: "ProgramCellDO",
        honesty: PROGRAM_CELL_HONESTY,
        coreHonesty: CORE_IN_CELLD_HONESTY,
      });
    }

    if (url.pathname.endsWith("/status") && request.method === "GET") {
      const programId = url.searchParams.get("programId") || "";
      if (!programId) {
        return Response.json({ ok: false, error: "programId required" }, { status: 400 });
      }
      const meta = await this.state.storage.get(metaKey(programId));
      if (!meta) {
        return Response.json({ ok: false, error: "not_found", programId }, { status: 404 });
      }
      const calls = Array.isArray(meta.plan?.calls) ? meta.plan.calls : [];
      const entries = [];
      const intents = [];
      for (let i = 0; i < calls.length; i++) {
        const e = await this.state.storage.get(entryKey(programId, i));
        if (e) entries.push(e);
        const intent = await this.state.storage.get(intentKey(programId, i));
        if (intent) intents.push(intent);
      }
      return Response.json({
        ok: true,
        do: "ProgramCellDO",
        honesty: PROGRAM_CELL_HONESTY,
        meta,
        entries,
        intents,
      });
    }

    if (url.pathname.endsWith("/run") && request.method === "POST") {
      return this.handleRun(request);
    }
    if (url.pathname.endsWith("/resume") && request.method === "POST") {
      return this.handleResume(request);
    }

    return Response.json(
      {
        do: "ProgramCellDO",
        paths: ["/health", "/status?programId=", "/run", "/resume"],
        honesty: PROGRAM_CELL_HONESTY,
      },
      { status: 404 }
    );
  }

  async handleRun(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const programId =
      typeof body.programId === "string" && body.programId
        ? body.programId
        : `prog_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const calls = Array.isArray(body.plan?.calls) ? body.plan.calls : [];
    if (!calls.length) {
      return Response.json({ ok: false, error: "plan.calls required" }, { status: 400 });
    }
    const existing = await this.state.storage.get(metaKey(programId));
    if (existing) {
      return Response.json(
        { ok: false, error: "exists", programId, hint: "use /resume" },
        { status: 409 }
      );
    }

    /**
     * Lab kill-node pauses (DOs are single-threaded — no forever-hang):
     * - pauseBeforeIndex: stop before host call (no intent) → resume re-runs
     * - pauseAfterIntentIndex: journal write intent then stop → resume outcome_unknown
     * - pauseDuringCallIndex: journal intent, start hanging upstream call (client SIGKILLs mid-flight)
     * - pauseAfterUpstreamBeforeJournalIndex: upstream returned; pause before entry journal
     */
    const pauseAfterIntentIndex =
      typeof body.pauseAfterIntentIndex === "number"
        ? body.pauseAfterIntentIndex
        : typeof body.hangAfterIndex === "number"
          ? body.hangAfterIndex
          : -1;
    const pauseBeforeIndex = typeof body.pauseBeforeIndex === "number" ? body.pauseBeforeIndex : -1;
    const pauseDuringCallIndex =
      typeof body.pauseDuringCallIndex === "number" ? body.pauseDuringCallIndex : -1;
    const pauseAfterUpstreamBeforeJournalIndex =
      typeof body.pauseAfterUpstreamBeforeJournalIndex === "number"
        ? body.pauseAfterUpstreamBeforeJournalIndex
        : -1;
    const now = new Date().toISOString();
    const meta = {
      programId,
      status: "running",
      plan: { v: 1, mode: "sequential", calls },
      owner: body.owner || "lab",
      createdAt: now,
      updatedAt: now,
      honesty: PROGRAM_CELL_HONESTY,
    };
    await this.state.storage.put(metaKey(programId), meta);

    const results = [];
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i] || {};
      if (call.tool === "await_approval") {
        const awaited = await this.runAwaitApprovalStep(programId, call, i, results, meta);
        if (awaited.done) return awaited.response;
        results.push(awaited.entry);
        continue;
      }
      const write = isWriteCall(call);
      if (pauseBeforeIndex === i) {
        meta.status = "paused_for_kill";
        meta.pausedAtIndex = i;
        meta.pauseKind = "before_intent";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: true,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          pausedAtIndex: i,
          pauseKind: "before_intent",
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "No intent; SIGKILL celld then POST /program/resume (re-run once — nothing sent yet)",
        });
      }
      if (write) {
        await this.state.storage.put(intentKey(programId, i), {
          index: i,
          callId: `c${i}`,
          operationId: call.operationId,
          startedAt: new Date().toISOString(),
        });
      }
      if (pauseAfterIntentIndex === i) {
        meta.status = "paused_for_kill";
        meta.pausedAtIndex = i;
        meta.pauseKind = "after_intent_before_call";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: true,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          pausedAtIndex: i,
          pauseKind: "after_intent_before_call",
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "Write intent durable; SIGKILL celld then POST /program/resume",
        });
      }
      if (pauseDuringCallIndex === i) {
        meta.status = "paused_for_kill";
        meta.pausedAtIndex = i;
        meta.pauseKind = "during_call";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        // Hang inside upstream fetch — client SIGKILLs celld while this awaits.
        const hungCall = {
          ...call,
          args: { ...(call.args || {}), hangMs: Number(call.args?.hangMs || 30_000) },
        };
        const outcome = await executeCall(this.env.CLAWQL_CORE_UPSTREAM, hungCall);
        // If we somehow return (hang cancelled), treat like normal completion.
        const entry = {
          index: i,
          callId: `c${i}`,
          tool: "execute",
          operationId: call.operationId,
          args: call.args || {},
          result: outcome,
          completedAt: new Date().toISOString(),
          replayed: false,
        };
        await this.state.storage.put(entryKey(programId, i), entry);
        if (write) await this.state.storage.delete(intentKey(programId, i));
        results.push(entry);
        continue;
      }
      const outcome = await executeCall(this.env.CLAWQL_CORE_UPSTREAM, call);
      if (pauseAfterUpstreamBeforeJournalIndex === i) {
        // Stash upstream result on intent AND meta. Meta is the discovery key after
        // peer ownership transfer — if meta is visible, finalizeResult is too
        // (intent-only stash was missing on peer → unsafe re-send / duplicates).
        if (write) {
          const prev = (await this.state.storage.get(intentKey(programId, i))) || {
            index: i,
            callId: `c${i}`,
            operationId: call.operationId,
          };
          await this.state.storage.put(intentKey(programId, i), {
            ...prev,
            upstreamResult: outcome,
            upstreamCompletedAt: new Date().toISOString(),
          });
        }
        meta.status = "paused_for_kill";
        meta.pausedAtIndex = i;
        meta.pauseKind = "after_call_before_journal";
        meta.finalizeAtIndex = i;
        meta.finalizeResult = outcome;
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: true,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          pausedAtIndex: i,
          pauseKind: "after_call_before_journal",
          upstreamOk: outcome.ok,
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "Upstream returned; result stashed on intent+meta; SIGKILL then resume finalizes without re-send",
        });
      }
      const entry = {
        index: i,
        callId: `c${i}`,
        tool: "execute",
        operationId: call.operationId,
        args: call.args || {},
        result: outcome,
        completedAt: new Date().toISOString(),
        replayed: false,
      };
      await this.state.storage.put(entryKey(programId, i), entry);
      if (write) await this.state.storage.delete(intentKey(programId, i));
      results.push(entry);
      if (!outcome.ok) {
        meta.status = "failed";
        meta.lastError = outcome.error;
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
        });
      }
    }

    meta.status = "completed";
    meta.updatedAt = new Date().toISOString();
    await this.state.storage.put(metaKey(programId), meta);
    return Response.json({
      ok: true,
      do: "ProgramCellDO",
      programId,
      status: meta.status,
      calls: results,
      honesty: PROGRAM_CELL_HONESTY,
    });
  }

  async handleResume(request) {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const programId = typeof body.programId === "string" ? body.programId : "";
    if (!programId) {
      return Response.json({ ok: false, error: "programId required" }, { status: 400 });
    }
    const meta = await this.state.storage.get(metaKey(programId));
    if (!meta) {
      return Response.json({ ok: false, error: "not_found", programId }, { status: 404 });
    }
    const calls = Array.isArray(meta.plan?.calls) ? meta.plan.calls : [];
    const results = [];
    let outcomeUnknown = false;

    for (let i = 0; i < calls.length; i++) {
      const call = calls[i] || {};
      const existing = await this.state.storage.get(entryKey(programId, i));
      if (call.tool === "await_approval") {
        if (existing) {
          const entryMatches = entryMatchesCall(existing, { ...call, tool: "await_approval" }, i);
          if (entryMatches === false) {
            meta.status = "failed";
            meta.lastError = "journal_divergence";
            meta.updatedAt = new Date().toISOString();
            await this.state.storage.put(metaKey(programId), meta);
            return Response.json({
              ok: false,
              do: "ProgramCellDO",
              programId,
              status: meta.status,
              calls: results,
              journalDivergence: true,
              diagnostics: {
                code: "journal_divergence",
                index: i,
                message:
                  "Journal entry no longer matches plan call at this index — recovery hard-stopped (do not continue)",
              },
              honesty: PROGRAM_CELL_HONESTY,
            });
          }
          results.push({ ...existing, replayed: true });
          continue;
        }
        const awaited = await this.runAwaitApprovalStep(programId, call, i, results, meta);
        if (awaited.done) return awaited.response;
        results.push(awaited.entry);
        continue;
      }
      const write = isWriteCall(call);
      const intent = await this.state.storage.get(intentKey(programId, i));
      const metaFinalize =
        meta.finalizeAtIndex === i && meta.finalizeResult != null ? meta.finalizeResult : null;
      const intentHasUpstreamResult = Boolean(intent?.upstreamResult) || Boolean(metaFinalize);
      const entryMatches = existing
        ? entryMatchesCall(existing, { ...call, tool: call.tool || "execute" }, i)
        : undefined;
      const decision = decideCallResume({
        hasEntry: Boolean(existing),
        hasIntent: Boolean(intent) || Boolean(metaFinalize),
        isWrite: write,
        intentHasUpstreamResult,
        pauseKind: meta.pauseKind,
        pausedAtIndex: meta.pausedAtIndex,
        callIndex: i,
        entryMatches,
      });
      if (decision.action === "journal_divergence") {
        meta.status = "failed";
        meta.lastError = "journal_divergence";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: results,
          journalDivergence: true,
          diagnostics: {
            code: "journal_divergence",
            index: i,
            message:
              "Journal entry no longer matches plan call at this index — recovery hard-stopped (do not continue)",
          },
          honesty: PROGRAM_CELL_HONESTY,
        });
      }
      if (decision.action === "replay") {
        results.push({ ...existing, replayed: true });
        continue;
      }
      if (decision.action === "finalize_upstream") {
        const outcome = intent?.upstreamResult ?? metaFinalize;
        const entry = {
          index: i,
          callId: `c${i}`,
          tool: "execute",
          operationId: call.operationId,
          args: call.args || {},
          result: outcome,
          completedAt: new Date().toISOString(),
          replayed: false,
          resumed: true,
          finalizedFromIntent: true,
        };
        await this.state.storage.put(entryKey(programId, i), entry);
        if (intent) await this.state.storage.delete(intentKey(programId, i));
        if (meta.finalizeAtIndex === i) {
          delete meta.finalizeAtIndex;
          delete meta.finalizeResult;
        }
        results.push(entry);
        if (!outcome?.ok) {
          meta.status = "failed";
          meta.lastError = outcome?.error;
          meta.updatedAt = new Date().toISOString();
          await this.state.storage.put(metaKey(programId), meta);
          return Response.json({
            ok: false,
            do: "ProgramCellDO",
            programId,
            status: meta.status,
            calls: results,
            honesty: PROGRAM_CELL_HONESTY,
          });
        }
        continue;
      }
      if (decision.action === "outcome_unknown") {
        const unk = {
          index: i,
          callId: `c${i}`,
          tool: "execute",
          operationId: call.operationId,
          args: call.args || {},
          result: {
            ok: false,
            status: "outcome_unknown",
            error:
              "Write intent journaled without entry — not re-run (at most once after celld SIGKILL)",
            value: null,
          },
          completedAt: new Date().toISOString(),
          replayed: false,
          outcomeUnknown: true,
        };
        await this.state.storage.put(entryKey(programId, i), unk);
        if (intent) await this.state.storage.delete(intentKey(programId, i));
        results.push(unk);
        outcomeUnknown = true;
        meta.status = "failed";
        meta.lastError = "outcome_unknown";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: results,
          outcomeUnknown: true,
          honesty: PROGRAM_CELL_HONESTY,
        });
      }

      // Interrupted read (or no intent): re-run once.
      const outcome = await executeCall(this.env.CLAWQL_CORE_UPSTREAM, call);
      const entry = {
        index: i,
        callId: `c${i}`,
        tool: "execute",
        operationId: call.operationId,
        args: call.args || {},
        result: outcome,
        completedAt: new Date().toISOString(),
        replayed: false,
        resumed: true,
      };
      await this.state.storage.put(entryKey(programId, i), entry);
      results.push(entry);
      if (!outcome.ok) {
        meta.status = "failed";
        meta.lastError = outcome.error;
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: false,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
        });
      }
    }

    meta.status = outcomeUnknown ? "failed" : "completed";
    meta.updatedAt = new Date().toISOString();
    await this.state.storage.put(metaKey(programId), meta);
    return Response.json({
      ok: meta.status === "completed",
      do: "ProgramCellDO",
      programId,
      status: meta.status,
      calls: results,
      honesty: PROGRAM_CELL_HONESTY,
    });
  }
}
