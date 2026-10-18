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
import { decideCallResume, isWriteCall } from "./program-cell-resume.js";

export const PROGRAM_CELL_HONESTY =
  "ProgramCellDO: durable plan journal in celld DO storage (LTX). SIGKILL of celld binary + resume proves isolate crash survival for this journal — not fleet diagnose, not host file-journal stand-in.";

export { decideCallResume, isWriteCall } from "./program-cell-resume.js";

function metaKey(programId) {
  return `program:${programId}:meta`;
}
function entryKey(programId, index) {
  return `program:${programId}:entry:${index}`;
}
function intentKey(programId, index) {
  return `program:${programId}:intent:${index}`;
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
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(call.args || {}),
      signal: AbortSignal.timeout(10_000),
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
     * - pauseBeforeIndex: stop before host call (no intent) → resume re-runs reads
     * - pauseAfterIntentIndex: journal write intent then stop → resume outcome_unknown
     */
    const pauseAfterIntentIndex =
      typeof body.pauseAfterIntentIndex === "number"
        ? body.pauseAfterIntentIndex
        : typeof body.hangAfterIndex === "number"
          ? body.hangAfterIndex
          : -1;
    const pauseBeforeIndex =
      typeof body.pauseBeforeIndex === "number" ? body.pauseBeforeIndex : -1;
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
      const write = isWriteCall(call);
      if (pauseBeforeIndex === i) {
        meta.status = "paused_for_kill";
        meta.pausedAtIndex = i;
        meta.pauseKind = "before_call";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: true,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          pausedAtIndex: i,
          pauseKind: "before_call",
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "No intent; SIGKILL celld then POST /program/resume (reads re-run)",
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
        meta.pauseKind = "after_write_intent";
        meta.updatedAt = new Date().toISOString();
        await this.state.storage.put(metaKey(programId), meta);
        return Response.json({
          ok: true,
          do: "ProgramCellDO",
          programId,
          status: meta.status,
          pausedAtIndex: i,
          pauseKind: "after_write_intent",
          calls: results,
          honesty: PROGRAM_CELL_HONESTY,
          note: "Write intent durable; SIGKILL celld then POST /program/resume",
        });
      }
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
      const write = isWriteCall(call);
      const existing = await this.state.storage.get(entryKey(programId, i));
      const intent = await this.state.storage.get(intentKey(programId, i));
      const decision = decideCallResume({
        hasEntry: Boolean(existing),
        hasIntent: Boolean(intent),
        isWrite: write,
      });
      if (decision.action === "replay") {
        results.push({ ...existing, replayed: true });
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
        await this.state.storage.delete(intentKey(programId, i));
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
