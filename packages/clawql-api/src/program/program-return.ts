/**
 * Resolve `plan.return` templates for compact program results (ADR 0015 fan-out).
 *
 * A return template is a JSON value that may contain `$ref` placeholders:
 * `{ "$ref": "<callId>.result.<path>" }` (path optional — bare `.result` is the whole value).
 *
 * Unlike proposal refs, return refs may resolve to any JSON (objects/arrays allowed).
 * When a plan sets `return`, the model-facing `execute_program` result is that value
 * (plus slim call status) — not the full per-call envelope.
 */

import { Effect } from "effect";
import {
  PROGRAM_REF_ID_PATTERN,
  PROPOSAL_ARGS_MAX_NESTING,
  PROPOSAL_REF_KEY,
  PROPOSAL_REF_MAX_DEPTH,
  PROPOSAL_REF_MAX_LENGTH,
} from "./program-refs.js";

export type ProgramReturnCall = {
  readonly id: string;
  readonly ok: boolean;
  readonly value: unknown;
};

export type ProgramReturnIssue = {
  readonly ok: false;
  readonly error: string;
  readonly fixHint: string;
};

export type ProgramReturnOk = {
  readonly ok: true;
  readonly value: unknown;
};

const FIX =
  'Use { "$ref": "<callId>.result" } or { "$ref": "<callId>.result.<path>" } inside plan.return.';

const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;

function issue(error: string, fixHint = FIX): ProgramReturnIssue {
  return { ok: false, error, fixHint };
}

function unwrapExecuteValue(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.content)) {
      const text = o.content
        .filter((c) => c && typeof c === "object" && (c as { type?: string }).type === "text")
        .map((c) => String((c as { text?: string }).text ?? ""))
        .join("\n");
      if (text) {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      }
    }
  }
  return value;
}

function readPath(root: unknown, path: readonly string[]): ProgramReturnOk | ProgramReturnIssue {
  let cur: unknown = root;
  for (const segment of path) {
    if (Array.isArray(cur)) {
      if (!ARRAY_INDEX.test(segment)) {
        return issue(`cannot index array with "${segment}"`);
      }
      const i = Number(segment);
      if (i >= cur.length) return issue(`index ${i} out of range (length ${cur.length})`);
      cur = cur[i];
    } else if (cur !== null && typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, segment)) {
        return issue(`key "${segment}" not found`);
      }
      cur = (cur as Record<string, unknown>)[segment];
    } else {
      return issue(`cannot read "${segment}" of ${cur === null ? "null" : typeof cur}`);
    }
  }
  return { ok: true, value: cur };
}

function resolveRef(
  raw: string,
  byId: ReadonlyMap<string, ProgramReturnCall>
): ProgramReturnOk | ProgramReturnIssue {
  if (raw.length > PROPOSAL_REF_MAX_LENGTH) {
    return issue(`$ref longer than ${PROPOSAL_REF_MAX_LENGTH} characters`);
  }
  const [target, root, ...path] = raw.split(".");
  if (!target || !PROGRAM_REF_ID_PATTERN.test(target)) {
    return issue(`$ref "${raw}" must start with a call id`);
  }
  if (root !== "result") {
    return issue(`$ref "${raw}" must use .result (return templates cannot read .args)`);
  }
  if (path.length > PROPOSAL_REF_MAX_DEPTH) {
    return issue(`$ref path deeper than ${PROPOSAL_REF_MAX_DEPTH}`);
  }
  const call = byId.get(target);
  if (!call) return issue(`unknown call id "${target}"`);
  if (!call.ok) return issue(`call "${target}" failed; cannot project into return`);
  const value = unwrapExecuteValue(call.value);
  return readPath(value, path);
}

/**
 * Coerce a call value into an object for `return: true` merge.
 * Object results merge by key; scalars/arrays wrap under the call id
 * (so `where: "result.value"` with id `ssl` becomes `{ ssl: … }`).
 */
export function coerceMergeObjectEffect(
  call: ProgramReturnCall,
  value: unknown
): Effect.Effect<{ readonly ok: true; readonly object: Record<string, unknown> } | ProgramReturnIssue> {
  return Effect.sync(() => {
    const unwrapped = unwrapExecuteValue(value);
    if (unwrapped !== null && typeof unwrapped === "object" && !Array.isArray(unwrapped)) {
      return { ok: true as const, object: unwrapped as Record<string, unknown> };
    }
    if (!call.id) {
      return issue(
        "scalar/array call result needs a call id to merge under return:true",
        'Set "id" on the call, or use where object projection: "{ssl: result.value}".'
      );
    }
    return { ok: true as const, object: { [call.id]: unwrapped } };
  });
}

/**
 * Merge successful call values into one object (disjoint keys from `where` shaping).
 * Activated by `plan.return: true` or `plan.return: "merge"`.
 * Scalars/arrays are wrapped under the call id so models that extract one value still merge.
 */
export function mergeProgramReturnEffect(
  calls: readonly ProgramReturnCall[]
): Effect.Effect<ProgramReturnOk | ProgramReturnIssue> {
  return Effect.gen(function* () {
    const out: Record<string, unknown> = {};
    for (const call of calls) {
      if (!call.ok) {
        return issue(`call "${call.id}" failed; cannot merge into return`);
      }
      const coerced = yield* coerceMergeObjectEffect(call, call.value);
      if (!coerced.ok) return coerced;
      for (const [key, v] of Object.entries(coerced.object)) {
        if (Object.prototype.hasOwnProperty.call(out, key)) {
          return issue(
            `merge conflict on key "${key}" (from call "${call.id}")`,
            'Use distinct where object keys (e.g. "{ssl: result.value}"), distinct call ids for scalar wraps, or a $ref return template.'
          );
        }
        out[key] = v;
      }
    }
    return { ok: true as const, value: out };
  });
}

/**
 * Resolve a return template against completed program calls.
 * Pass `true` / `"merge"` to deep-merge call objects (no template tokens in the plan).
 */
export function resolveProgramReturnEffect(
  template: unknown,
  calls: readonly ProgramReturnCall[]
): Effect.Effect<ProgramReturnOk | ProgramReturnIssue> {
  if (template === true || template === "merge") {
    return mergeProgramReturnEffect(calls);
  }
  return Effect.sync(() => {
    const byId = new Map(calls.map((c) => [c.id, c]));
    const walk = (node: unknown, depth: number): ProgramReturnOk | ProgramReturnIssue => {
      if (depth > PROPOSAL_ARGS_MAX_NESTING) {
        return issue(`return template nests deeper than ${PROPOSAL_ARGS_MAX_NESTING}`);
      }
      if (node === null || typeof node !== "object") {
        return { ok: true, value: node };
      }
      if (Array.isArray(node)) {
        const out: unknown[] = [];
        for (const item of node) {
          const r = walk(item, depth + 1);
          if (!r.ok) return r;
          out.push(r.value);
        }
        return { ok: true, value: out };
      }
      const obj = node as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, PROPOSAL_REF_KEY)) {
        if (Object.keys(obj).length !== 1) {
          return issue("a $ref placeholder must be the only key in its object");
        }
        const raw = obj[PROPOSAL_REF_KEY];
        if (typeof raw !== "string") return issue("$ref must be a string");
        return resolveRef(raw, byId);
      }
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj)) {
        const r = walk(obj[key], depth + 1);
        if (!r.ok) return r;
        out[key] = r.value;
      }
      return { ok: true, value: out };
    };
    return walk(template, 0);
  });
}

export function resolveProgramReturn(
  template: unknown,
  calls: readonly ProgramReturnCall[]
): ProgramReturnOk | ProgramReturnIssue {
  return Effect.runSync(resolveProgramReturnEffect(template, calls));
}
