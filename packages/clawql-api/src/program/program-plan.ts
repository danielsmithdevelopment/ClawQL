/**
 * Parse v0 program `source` as a JSON plan (host-callback runner).
 *
 * Honest MVP: not a JS AST interpreter. Accepted shapes:
 * - `{ "v": 1, "mode": "parallel"|"sequential", "calls": [ ... ] }`
 * - bare array of call objects (implies parallel)
 */

import { Effect } from "effect";

export type ProgramPlanMode = "parallel" | "sequential";

export type ProgramPlanExecuteCall = {
  readonly tool: "execute";
  readonly operationId: string;
  readonly args?: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  readonly id?: string;
};

export type ProgramPlanSearchCall = {
  readonly tool: "search";
  readonly query: string;
  readonly limit?: number;
  readonly id?: string;
};

export type ProgramPlanCall = ProgramPlanExecuteCall | ProgramPlanSearchCall;

export type ProgramPlan = {
  readonly v: 1;
  readonly mode: ProgramPlanMode;
  readonly calls: readonly ProgramPlanCall[];
  /** Honesty marker for diagnostics. */
  readonly kind: "plan";
};

export type ProgramPlanParseError = {
  readonly ok: false;
  readonly error: string;
  readonly fixHint: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseCall(raw: unknown, index: number): ProgramPlanCall | ProgramPlanParseError {
  if (!isRecord(raw)) {
    return {
      ok: false,
      error: `calls[${index}] must be an object`,
      fixHint:
        'Use { "tool": "execute", "operationId": "...", "args": {} } or { "tool": "search", "query": "..." }',
    };
  }
  const tool = raw.tool;
  if (tool === "execute") {
    const operationId = typeof raw.operationId === "string" ? raw.operationId.trim() : "";
    if (!operationId) {
      return {
        ok: false,
        error: `calls[${index}].operationId required for tool execute`,
        fixHint: "Set operationId from a prior search result.",
      };
    }
    const args =
      raw.args && isRecord(raw.args)
        ? (raw.args as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    const fields = Array.isArray(raw.fields)
      ? raw.fields.filter((f): f is string => typeof f === "string")
      : undefined;
    const where = typeof raw.where === "string" ? raw.where : undefined;
    const id = typeof raw.id === "string" ? raw.id : undefined;
    return { tool: "execute", operationId, args, fields, where, id };
  }
  if (tool === "search") {
    const query = typeof raw.query === "string" ? raw.query : "";
    if (!query.trim()) {
      return {
        ok: false,
        error: `calls[${index}].query required for tool search`,
        fixHint: 'Use { "tool": "search", "query": "list open PRs" }.',
      };
    }
    const limit =
      typeof raw.limit === "number" && Number.isFinite(raw.limit)
        ? Math.trunc(raw.limit)
        : undefined;
    const id = typeof raw.id === "string" ? raw.id : undefined;
    return { tool: "search", query, limit, id };
  }
  return {
    ok: false,
    error: `calls[${index}].tool must be "execute" or "search" (got ${JSON.stringify(tool)})`,
    fixHint:
      "v0 plan runner only allows host-injected search/execute. OpenCode-style JS programs are not supported yet.",
  };
}

/**
 * Decode program source into a v0 plan. Fail-closed with a fix hint when the
 * payload looks like free-form JS (not a JSON plan).
 */
export function parseProgramPlanEffect(
  source: string
): Effect.Effect<ProgramPlan | ProgramPlanParseError> {
  return Effect.sync(() => {
    const trimmed = source.trim();
    if (!trimmed) {
      return {
        ok: false as const,
        error: "source is empty",
        fixHint:
          'Pass a JSON plan: { "v": 1, "mode": "parallel", "calls": [{ "tool": "execute", "operationId": "...", "args": {} }] }',
      };
    }
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return {
        ok: false as const,
        error: "v0 plan runner rejects non-JSON program source",
        fixHint:
          "Honesty: v0 is a JSON plan runner (parallel/sequential read executes), not a full JS AST interpreter. OpenCode vendor is next. Supply a JSON plan object or array of calls.",
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (e) {
      return {
        ok: false as const,
        error: `source is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        fixHint: "Fix JSON syntax, or wait for the OpenCode-vendored interpreter.",
      };
    }

    if (Array.isArray(parsed)) {
      const calls: ProgramPlanCall[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const c = parseCall(parsed[i], i);
        if ("ok" in c && c.ok === false) return c;
        calls.push(c as ProgramPlanCall);
      }
      return { v: 1 as const, mode: "parallel" as const, calls, kind: "plan" as const };
    }

    if (!isRecord(parsed)) {
      return {
        ok: false as const,
        error: "plan root must be an object or array",
        fixHint: 'Use { "v": 1, "mode": "parallel", "calls": [...] }',
      };
    }

    const modeRaw = parsed.mode;
    const mode: ProgramPlanMode =
      modeRaw === "sequential"
        ? "sequential"
        : modeRaw === "parallel" || modeRaw === undefined
          ? "parallel"
          : ("invalid" as ProgramPlanMode);
    if (mode === ("invalid" as ProgramPlanMode)) {
      return {
        ok: false as const,
        error: `mode must be "parallel" or "sequential" (got ${JSON.stringify(modeRaw)})`,
        fixHint: 'Set "mode": "parallel" for fan-out reads.',
      };
    }

    const callsRaw = parsed.calls;
    if (!Array.isArray(callsRaw)) {
      return {
        ok: false as const,
        error: "plan.calls must be an array",
        fixHint: 'Include "calls": [ { "tool": "execute", ... }, ... ]',
      };
    }
    const calls: ProgramPlanCall[] = [];
    for (let i = 0; i < callsRaw.length; i++) {
      const c = parseCall(callsRaw[i], i);
      if ("ok" in c && c.ok === false) return c;
      calls.push(c as ProgramPlanCall);
    }
    return { v: 1 as const, mode, calls, kind: "plan" as const };
  });
}
