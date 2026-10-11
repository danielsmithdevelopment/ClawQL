/**
 * Parse v0 program `source` as a JSON plan (host-callback runner).
 *
 * Honest MVP: not a JS AST interpreter. Accepted shapes:
 * - `{ "v": 1, "mode": "parallel"|"sequential", "calls": [ ... ], "proposals"?: [ ... ] }`
 * - bare array of call objects (implies parallel, no proposals)
 *
 * `proposals` are writes the program returns for the gateway to run later through
 * normal `execute` (ADR 0015 § Proposed writes). They may carry `$ref` placeholders
 * (see {@link ./program-refs.js}); refs are validated here, before any read runs.
 */

import { Effect } from "effect";
import { EXECUTE_WHERE_MAX_LENGTH } from "../schema/search-execute-schema.js";
import {
  collectProposalRefSitesEffect,
  isProposalRefIssue,
  PROGRAM_REF_ID_PATTERN,
  PROPOSAL_ARGS_MAX_NESTING,
  PROPOSAL_REF_KEY,
  type ProposalRefSite,
} from "./program-refs.js";

export type ProgramPlanMode = "parallel" | "sequential";

export type ProgramPlanExecuteCall = {
  readonly tool: "execute";
  readonly operationId: string;
  readonly args?: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  /** Explicit id, or `call_<index>` when the plan omits it. */
  readonly id: string;
};

export type ProgramPlanSearchCall = {
  readonly tool: "search";
  readonly query: string;
  readonly limit?: number;
  /** Explicit id, or `call_<index>` when the plan omits it. */
  readonly id: string;
};

export type ProgramPlanCall = ProgramPlanExecuteCall | ProgramPlanSearchCall;

/** A write the program proposes; never executed inside the program. */
export type ProgramPlanProposal = {
  /** Explicit id, or `proposal_<index>` when the plan omits it. */
  readonly id: string;
  readonly index: number;
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  /** `$ref` placeholders in `args`, already checked for syntax, caps, and scope. */
  readonly refs: readonly ProposalRefSite[];
};

export type ProgramPlan = {
  readonly v: 1;
  readonly mode: ProgramPlanMode;
  readonly calls: readonly ProgramPlanCall[];
  /** Always set by the parser; absent from plans journaled before proposals existed. */
  readonly proposals?: readonly ProgramPlanProposal[];
  /** Honesty marker for diagnostics. */
  readonly kind: "plan";
};

export type ProgramPlanParseError = {
  readonly ok: false;
  readonly error: string;
  readonly fixHint: string;
};

type ParseResult<A> = A | ProgramPlanParseError;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isParseError(v: unknown): v is ProgramPlanParseError {
  return isRecord(v) && v.ok === false;
}

function parseError(error: string, fixHint: string): ProgramPlanParseError {
  return { ok: false, error, fixHint };
}

function hasRefKey(node: unknown, depth = 0): boolean {
  if (node === null || typeof node !== "object" || depth > PROPOSAL_ARGS_MAX_NESTING) return false;
  if (Array.isArray(node)) return node.some((v) => hasRefKey(v, depth + 1));
  if (Object.prototype.hasOwnProperty.call(node, PROPOSAL_REF_KEY)) return true;
  return Object.values(node).some((v) => hasRefKey(v, depth + 1));
}

function parseCall(raw: unknown, index: number): ParseResult<ProgramPlanCall> {
  if (!isRecord(raw)) {
    return parseError(
      `calls[${index}] must be an object`,
      'Use { "tool": "execute", "operationId": "...", "args": {} } or { "tool": "search", "query": "..." }'
    );
  }
  const id = typeof raw.id === "string" ? raw.id : `call_${index}`;
  const tool = raw.tool;
  if (tool === "execute") {
    const operationId = typeof raw.operationId === "string" ? raw.operationId.trim() : "";
    if (!operationId) {
      return parseError(
        `calls[${index}].operationId required for tool execute`,
        "Set operationId from a prior search result."
      );
    }
    const args =
      raw.args && isRecord(raw.args)
        ? (raw.args as Record<string, unknown>)
        : ({} as Record<string, unknown>);
    if (hasRefKey(args)) {
      return parseError(
        `calls[${index}].args contains a $ref placeholder`,
        "Refs are resolved only inside proposals. Use literal args for read calls."
      );
    }
    const fields = Array.isArray(raw.fields)
      ? raw.fields.filter((f): f is string => typeof f === "string")
      : undefined;
    const where = typeof raw.where === "string" ? raw.where : undefined;
    return { tool: "execute", operationId, args, fields, where, id };
  }
  if (tool === "search") {
    const query = typeof raw.query === "string" ? raw.query : "";
    if (!query.trim()) {
      return parseError(
        `calls[${index}].query required for tool search`,
        'Use { "tool": "search", "query": "list open PRs" }.'
      );
    }
    const limit =
      typeof raw.limit === "number" && Number.isFinite(raw.limit)
        ? Math.trunc(raw.limit)
        : undefined;
    return { tool: "search", query, limit, id };
  }
  return parseError(
    `calls[${index}].tool must be "execute" or "search" (got ${JSON.stringify(tool)})`,
    "v0 plan runner only allows host-injected search/execute. OpenCode-style JS programs are not supported yet."
  );
}

type ProposalDraft = Omit<ProgramPlanProposal, "refs">;

function parseProposalDraft(raw: unknown, index: number): ParseResult<ProposalDraft> {
  const at = `proposals[${index}]`;
  if (!isRecord(raw)) {
    return parseError(
      `${at} must be an object`,
      'Use { "id": "W1", "operationId": "...", "args": {} }.'
    );
  }
  if (raw.tool !== undefined && raw.tool !== "execute") {
    return parseError(
      `${at}.tool must be "execute" when set (got ${JSON.stringify(raw.tool)})`,
      "Proposals are writes the gateway runs later through execute; drop the tool field."
    );
  }
  const operationId = typeof raw.operationId === "string" ? raw.operationId.trim() : "";
  if (!operationId) {
    return parseError(`${at}.operationId required`, "Set operationId from a prior search result.");
  }
  let id = `proposal_${index}`;
  if (raw.id !== undefined) {
    if (typeof raw.id !== "string" || !PROGRAM_REF_ID_PATTERN.test(raw.id)) {
      return parseError(
        `${at}.id must match ${PROGRAM_REF_ID_PATTERN.source}`,
        'Use short ids such as "W1" (letters, digits, _ or -; no dots).'
      );
    }
    id = raw.id;
  }
  if (raw.args !== undefined && !isRecord(raw.args)) {
    return parseError(`${at}.args must be an object`, 'Use "args": { ... }.');
  }
  const args = (raw.args ?? {}) as Record<string, unknown>;
  let fields: readonly string[] | undefined;
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields) || !raw.fields.every((f) => typeof f === "string")) {
      return parseError(`${at}.fields must be an array of strings`, 'Use "fields": ["id"].');
    }
    fields = [...raw.fields];
  }
  let where: string | undefined;
  if (raw.where !== undefined) {
    if (typeof raw.where !== "string" || raw.where.length > EXECUTE_WHERE_MAX_LENGTH) {
      return parseError(
        `${at}.where must be a string of at most ${EXECUTE_WHERE_MAX_LENGTH} characters`,
        "Shorten the JMESPath expression or drop where."
      );
    }
    where = raw.where;
  }
  return { id, index, operationId, args, fields, where };
}

type IdOwner = {
  readonly kind: "call" | "proposal";
  readonly index: number;
  readonly label: string;
};

function claimId(
  owners: Map<string, IdOwner>,
  id: string,
  owner: IdOwner
): ProgramPlanParseError | undefined {
  const prior = owners.get(id);
  if (prior) {
    return parseError(
      `duplicate id "${id}" (${prior.label} and ${owner.label})`,
      "Give every call and proposal a unique id."
    );
  }
  owners.set(id, owner);
  return undefined;
}

/**
 * Parse a `proposals` array and check every `$ref` against the ids declared so far:
 * call refs must use `.result`; proposal refs must point at an earlier proposal.
 */
function parseProposalsEffect(
  raw: unknown,
  owners: Map<string, IdOwner>
): Effect.Effect<ParseResult<readonly ProgramPlanProposal[]>> {
  return Effect.gen(function* () {
    if (!Array.isArray(raw)) {
      return parseError(
        "plan.proposals must be an array",
        'Use "proposals": [ { "id": "W1", "operationId": "...", "args": {} } ]'
      );
    }
    const drafts: ProposalDraft[] = [];
    for (let i = 0; i < raw.length; i++) {
      const draft = parseProposalDraft(raw[i], i);
      if (isParseError(draft)) return draft;
      const dup = claimId(owners, draft.id, {
        kind: "proposal",
        index: i,
        label: `proposals[${i}]`,
      });
      if (dup) return dup;
      drafts.push(draft);
    }

    const proposals: ProgramPlanProposal[] = [];
    for (const draft of drafts) {
      const at = `proposals[${draft.index}]`;
      const sites = yield* collectProposalRefSitesEffect(draft.args);
      if (isProposalRefIssue(sites)) {
        return parseError(`${at}.args: ${sites.error}`, sites.fixHint);
      }
      for (const site of sites) {
        const owner = owners.get(site.ref.target);
        if (!owner) {
          return parseError(
            `${at}.args${site.at}: $ref "${site.ref.raw}" targets unknown id "${site.ref.target}"`,
            "Refs may only point at a read call or an earlier proposal in the same plan."
          );
        }
        if (owner.kind === "call" && site.ref.root !== "result") {
          return parseError(
            `${at}.args${site.at}: $ref "${site.ref.raw}" — read calls expose only .result`,
            `Use "${site.ref.target}.result.<path>".`
          );
        }
        if (owner.kind === "proposal" && owner.index >= draft.index) {
          return parseError(
            `${at}.args${site.at}: $ref "${site.ref.raw}" must point at an earlier proposal`,
            "Order proposals so each one only references proposals listed before it."
          );
        }
      }
      proposals.push({ ...draft, refs: sites });
    }
    return proposals;
  });
}

/**
 * Parse a bare `proposals` array (e.g. `result.proposals` echoed back to
 * `submit_program_proposals`). No read calls exist in this scope, so refs may only
 * target earlier proposals.
 */
export function parseProgramProposalsEffect(
  raw: unknown
): Effect.Effect<readonly ProgramPlanProposal[] | ProgramPlanParseError> {
  return parseProposalsEffect(raw, new Map());
}

/**
 * Decode program source into a v0 plan. Fail-closed with a fix hint when the
 * payload looks like free-form JS (not a JSON plan).
 */
export function parseProgramPlanEffect(
  source: string
): Effect.Effect<ProgramPlan | ProgramPlanParseError> {
  return Effect.gen(function* () {
    const trimmed = source.trim();
    if (!trimmed) {
      return parseError(
        "source is empty",
        'Pass a JSON plan: { "v": 1, "mode": "parallel", "calls": [{ "tool": "execute", "operationId": "...", "args": {} }] }'
      );
    }
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return parseError(
        "v0 plan runner rejects non-JSON program source",
        "Honesty: v0 is a JSON plan runner (parallel/sequential read executes), not a full JS AST interpreter. OpenCode vendor is next. Supply a JSON plan object or array of calls."
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (e) {
      return parseError(
        `source is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        "Fix JSON syntax, or wait for the OpenCode-vendored interpreter."
      );
    }

    const parseCalls = (raw: readonly unknown[]): ParseResult<ProgramPlanCall[]> => {
      const calls: ProgramPlanCall[] = [];
      for (let i = 0; i < raw.length; i++) {
        const c = parseCall(raw[i], i);
        if (isParseError(c)) return c;
        calls.push(c);
      }
      return calls;
    };

    if (Array.isArray(parsed)) {
      const calls = parseCalls(parsed);
      if (isParseError(calls)) return calls;
      return {
        v: 1 as const,
        mode: "parallel" as const,
        calls,
        proposals: [],
        kind: "plan" as const,
      };
    }

    if (!isRecord(parsed)) {
      return parseError(
        "plan root must be an object or array",
        'Use { "v": 1, "mode": "parallel", "calls": [...] }'
      );
    }

    const modeRaw = parsed.mode;
    if (modeRaw !== undefined && modeRaw !== "parallel" && modeRaw !== "sequential") {
      return parseError(
        `mode must be "parallel" or "sequential" (got ${JSON.stringify(modeRaw)})`,
        'Set "mode": "parallel" for fan-out reads.'
      );
    }
    const mode: ProgramPlanMode = modeRaw === "sequential" ? "sequential" : "parallel";

    const callsRaw = parsed.calls;
    const proposalsRaw = parsed.proposals;
    const proposalsOnly = callsRaw === undefined && proposalsRaw !== undefined;
    if (!proposalsOnly && !Array.isArray(callsRaw)) {
      return parseError(
        "plan.calls must be an array",
        'Include "calls": [ { "tool": "execute", ... }, ... ]'
      );
    }
    const calls = parseCalls(Array.isArray(callsRaw) ? callsRaw : []);
    if (isParseError(calls)) return calls;

    let proposals: readonly ProgramPlanProposal[] = [];
    if (proposalsRaw !== undefined) {
      // Refs need unambiguous targets; plans without proposals keep tolerating repeated call ids.
      const owners = new Map<string, IdOwner>();
      for (let i = 0; i < calls.length; i++) {
        const dup = claimId(owners, calls[i]!.id, { kind: "call", index: i, label: `calls[${i}]` });
        if (dup) return dup;
      }
      const parsedProposals = yield* parseProposalsEffect(proposalsRaw, owners);
      if (isParseError(parsedProposals)) return parsedProposals;
      proposals = parsedProposals;
    }
    return { v: 1 as const, mode, calls, proposals, kind: "plan" as const };
  });
}
