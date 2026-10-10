/**
 * `submit_program_proposals` (ADR 0015 § Proposed writes): run a program's proposals
 * through normal execute — gate, risk, session IFC, mandate park, audit — in plan order,
 * filling `<proposal>.result` refs from earlier proposals' actual results.
 *
 * Batches are not atomic. Each leaf ends `ran`, `failed`, `dropped`, or `pending`.
 * Submitting the same programId again continues the batch: settled leaves never run
 * twice; a parked leaf is re-checked (a mandate approved in Review is consumed once
 * through execute; one settled elsewhere, e.g. by `resume`, is adopted); a leaf waiting
 * on a parked dependency resolves once that dependency ran. Submit never approves or
 * declines anything itself — that stays with Review / `resume`.
 */

import { appendProcessWormEffect } from "clawql-audit";
import { Context, Effect, Layer } from "effect";
import type { Label } from "../ifc/labels.js";
import { resolveSessionLabelKey } from "../ifc/session-label-store.js";
import { hashPendingArgsEffect } from "../pending/args-hash.js";
import { PendingExecutionService } from "../pending/pending-execution-service.js";
import type { PendingExecutionStatus } from "../pending/pending-execution-types.js";
import { resolveProgramCapsEffect } from "./program-caps.js";
import { parseProgramProposalsEffect } from "./program-plan.js";
import {
  currentProgramProposalStoreEffect,
  programProposalRecordTtlMsEffect,
} from "./program-proposal-store.js";
import {
  checkProposalIfcEffect,
  type ProposalLeaf,
  type ProposalOperationInfo,
  type ProposalOperationLookup,
  type ProposalRejectCode,
  type ResolvedProposal,
} from "./program-proposals.js";
import {
  collectProposalRefSitesEffect,
  isProposalRefIssue,
  readProposalRefPathEffect,
  substituteProposalRefsEffect,
  type ProposalRefScalar,
} from "./program-refs.js";
import { buildBatchMerkleEffect } from "./batch-merkle.js";

export type ProgramSubmitExecuteInput = {
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  /** Consume this approved parked mandate once instead of parking again. */
  readonly approvedExecutionId?: string;
};

export type ProgramSubmitHostResult = {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
};

/** Host callbacks — production wires these to the MCP `execute` path and the mandate store. */
export type ProgramSubmitHost = {
  readonly execute: (
    input: ProgramSubmitExecuteInput,
    ctx: { readonly programId: string; readonly proposalId: string }
  ) => Effect.Effect<ProgramSubmitHostResult, Error>;
  readonly lookup: ProposalOperationLookup;
  /** Status of a parked mandate (`null` = unknown id). Without it parked leaves stay `pending`. */
  readonly pendingStatus?: (
    executionId: string
  ) => Effect.Effect<PendingExecutionStatus | null, Error>;
};

export type SubmitProgramProposalsInput = {
  readonly programId: string;
  /** `result.proposals` from `execute_program`; optional while this process holds the record. */
  readonly proposals?: unknown;
  readonly sessionId?: string;
};

export type SubmittedLeaf = Omit<ProposalLeaf, "result"> & {
  readonly result?: unknown;
  readonly resultTruncated?: boolean;
  readonly resultPreview?: string;
  /** Not submitted yet: these dependencies have not run. */
  readonly waitingOn?: readonly string[];
};

export type SubmitProgramProposalsResult = {
  /** No leaf failed or was dropped. */
  readonly ok: boolean;
  /** No leaf is still pending. */
  readonly complete: boolean;
  readonly programId: string;
  readonly leaves: readonly SubmittedLeaf[];
  readonly summary: {
    readonly ran: number;
    readonly failed: number;
    readonly dropped: number;
    readonly pending: number;
  };
  /**
   * Merkle root over proposal argsHash digests (ADR 0015 batch approve).
   * One key-touch may sign this root; each leaf proves inclusion. Not a single
   * mandate digest covering the batch.
   */
  readonly batchMerkle?: {
    readonly root: string;
    readonly leafCount: number;
    readonly digests: readonly { readonly id: string; readonly argsHash: string }[];
  };
  readonly code?: string;
  readonly error?: string;
  readonly fixHint?: string;
};

const PROGRAM_ID_PATTERN = /^prog_[A-Za-z0-9_-]{8,128}$/;

const RESULT_UNAVAILABLE_HINT =
  "Approve parked proposals in Review, then submit again so the batch runs them — resume returns the result only to its caller, so dependents cannot read it.";

type Outcome =
  | { readonly kind: "ran"; readonly value: unknown }
  | {
      readonly kind: "parked";
      readonly executionId: string;
      readonly argsHash?: string;
      readonly approval?: unknown;
      readonly expiresAt?: string;
    }
  | {
      readonly kind: "dropped" | "failed";
      readonly status?: string;
      readonly code?: string;
      readonly error: string;
      readonly fixHint?: string;
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Same reading of an execute response as execute-core's outcome check. */
function classifyOutcome(text: string, consuming: boolean): Outcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { kind: "ran", value: text };
  }
  if (!isRecord(parsed)) return { kind: "ran", value: parsed };
  const status = str(parsed.status);
  const reason = str(parsed.error) ?? str(parsed.reason);
  if (status === "mandate_required") {
    const executionId = str(parsed.executionId);
    if (!consuming && executionId) {
      return {
        kind: "parked",
        executionId,
        argsHash: str(parsed.argsHash),
        approval: parsed.approval,
        expiresAt: str(parsed.expiresAt),
      };
    }
    return {
      kind: "failed",
      status,
      code: "mandate_not_consumable",
      error: reason ?? "approved mandate could not be consumed",
    };
  }
  if (status === "blocked") {
    return {
      kind: "dropped",
      status,
      code: "blocked",
      error: reason ?? "blocked by policy",
      fixHint: str(parsed.fix),
    };
  }
  if (status === "declined") {
    return { kind: "dropped", status, code: "declined", error: "declined by a human" };
  }
  if (parsed.ok === false) {
    return { kind: "failed", status, error: reason ?? status ?? "execute failed" };
  }
  if (str(parsed.error) && parsed.ok !== true && !("results" in parsed)) {
    return { kind: "failed", error: str(parsed.error)! };
  }
  return { kind: "ran", value: parsed };
}

type LeafBase = Omit<ProposalLeaf, "state">;

function leafFromOutcome(base: LeafBase, outcome: Outcome, maxResultBytes: number): ProposalLeaf {
  switch (outcome.kind) {
    case "ran": {
      const kept = Buffer.byteLength(JSON.stringify(outcome.value) ?? "", "utf8") <= maxResultBytes;
      return {
        ...base,
        state: "ran",
        ...(kept
          ? { result: outcome.value, resultCaptured: true }
          : {
              resultCaptured: false,
              fixHint: "Result too large to keep for refs; dependents reading it are dropped.",
            }),
      };
    }
    case "parked":
      return {
        ...base,
        state: "pending",
        status: "mandate_required",
        executionId: outcome.executionId,
        argsHash: outcome.argsHash ?? base.argsHash,
        ...(outcome.approval !== undefined ? { approval: outcome.approval } : {}),
        ...(outcome.expiresAt ? { expiresAt: outcome.expiresAt } : {}),
      };
    default:
      return {
        ...base,
        state: outcome.kind,
        ...(outcome.status ? { status: outcome.status } : {}),
        ...(outcome.code ? { code: outcome.code } : {}),
        error: outcome.error,
        ...(outcome.fixHint ? { fixHint: outcome.fixHint } : {}),
      };
  }
}

function hostText(run: Effect.Effect<ProgramSubmitHostResult, Error>): Effect.Effect<string> {
  return run.pipe(
    Effect.map((out) => out.content[0]?.text ?? ""),
    Effect.catch((e) =>
      Effect.succeed(
        JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) })
      )
    )
  );
}

type SubmitContext = {
  readonly programId: string;
  readonly host: ProgramSubmitHost;
  readonly programLabels: readonly Label[];
  readonly sessionId?: string;
  readonly env: NodeJS.ProcessEnv;
  readonly maxResultBytes: number;
};

function leafBaseOf(leaf: ProposalLeaf): LeafBase {
  return {
    id: leaf.id,
    index: leaf.index,
    operationId: leaf.operationId,
    args: leaf.args,
    ...(leaf.fields !== undefined ? { fields: leaf.fields } : {}),
    ...(leaf.where !== undefined ? { where: leaf.where } : {}),
    ...(leaf.argsHash !== undefined ? { argsHash: leaf.argsHash } : {}),
    ...(leaf.executionId !== undefined ? { executionId: leaf.executionId } : {}),
  };
}

/** A parked leaf whose mandate settled outside this batch; `undefined` = still pending. */
function settledFromStatus(
  leaf: ProposalLeaf,
  status: PendingExecutionStatus | null
): ProposalLeaf | undefined {
  const base = leafBaseOf(leaf);
  switch (status) {
    case "pending":
    case "approved":
      return undefined;
    case null:
      return {
        ...base,
        state: "failed",
        code: "mandate_missing",
        error: `parked execution ${leaf.executionId} not found`,
      };
    case "completed":
      return {
        ...base,
        state: "ran",
        status,
        resultCaptured: false,
        fixHint: RESULT_UNAVAILABLE_HINT,
      };
    case "outcome_unknown":
      return {
        ...base,
        state: "failed",
        status,
        error: "side effect may or may not have happened",
        fixHint: "Resolve it in Review (mark applied / not applied).",
      };
    case "failed":
      return { ...base, state: "failed", status, error: "parked execution failed" };
    case "declined":
    case "expired":
      return { ...base, state: "dropped", status, code: status, error: `mandate ${status}` };
  }
}

/** Re-check a parked leaf: consume a Review approval once, or adopt a state settled elsewhere. */
function refreshParkedEffect(leaf: ProposalLeaf, ctx: SubmitContext): Effect.Effect<ProposalLeaf> {
  return Effect.gen(function* () {
    const executionId = leaf.executionId;
    if (!executionId || !ctx.host.pendingStatus) return leaf;
    const status = yield* ctx.host
      .pendingStatus(executionId)
      .pipe(Effect.catch(() => Effect.succeed(undefined)));
    if (status === undefined) return leaf;
    if (status === "approved") {
      const text = yield* hostText(
        ctx.host.execute(
          {
            operationId: leaf.operationId,
            args: leaf.args,
            fields: leaf.fields,
            where: leaf.where,
            approvedExecutionId: executionId,
          },
          { programId: ctx.programId, proposalId: leaf.id }
        )
      );
      return leafFromOutcome(leafBaseOf(leaf), classifyOutcome(text, true), ctx.maxResultBytes);
    }
    return settledFromStatus(leaf, status) ?? leaf;
  });
}

/** Advance one proposal by one step; settled leaves are returned as recorded. */
function advanceEffect(
  item: ResolvedProposal,
  leaves: Record<string, ProposalLeaf>,
  ctx: SubmitContext
): Effect.Effect<SubmittedLeaf> {
  return Effect.gen(function* () {
    const existing = leaves[item.id];
    if (existing) {
      if (existing.state !== "pending") return existing;
      const next = yield* refreshParkedEffect(existing, ctx);
      leaves[item.id] = next;
      return next;
    }

    const base: LeafBase = {
      id: item.id,
      index: item.index,
      operationId: item.operationId,
      args: item.args,
      ...(item.fields !== undefined ? { fields: item.fields } : {}),
      ...(item.where !== undefined ? { where: item.where } : {}),
    };
    const settle = (leaf: ProposalLeaf): ProposalLeaf => {
      leaves[item.id] = leaf;
      return leaf;
    };
    const drop = (code: string, error: string, fixHint?: string): ProposalLeaf =>
      settle({ ...base, state: "dropped", code, error, ...(fixHint ? { fixHint } : {}) });

    if (item.status === "rejected") {
      return drop(
        item.code ?? "rejected",
        item.error ?? "rejected by execute_program",
        item.fixHint
      );
    }

    const sites = yield* collectProposalRefSitesEffect(item.args);
    if (isProposalRefIssue(sites)) return drop("ref_unresolved", sites.error, sites.fixHint);
    const values = new Map<string, ProposalRefScalar>();
    const waitingOn = new Set<string>();
    for (const site of sites) {
      const { target, root, path, raw } = site.ref;
      const label = `args${site.at}: $ref "${raw}"`;
      const dep = leaves[target];
      if (!dep || (root === "result" && dep.state === "pending")) {
        waitingOn.add(target);
        continue;
      }
      if (dep.state === "failed" || dep.state === "dropped") {
        return drop(`dependency_${dep.state}`, `${label} — proposal ${target} ${dep.state}`);
      }
      if (root === "result" && !dep.resultCaptured) {
        return drop(
          "result_unavailable",
          `${label} — the result of ${target} was not kept`,
          RESULT_UNAVAILABLE_HINT
        );
      }
      const read = yield* readProposalRefPathEffect(
        root === "result" ? dep.result : dep.args,
        path
      );
      if (!read.ok) return drop("ref_unresolved", `${label} — ${read.error}`);
      values.set(site.at, read.value);
    }
    const args = yield* substituteProposalRefsEffect(item.args, values);
    if (waitingOn.size > 0) {
      return { ...base, args, state: "pending", status: "waiting", waitingOn: [...waitingOn] };
    }

    const argsHash = yield* hashPendingArgsEffect({
      operationId: item.operationId,
      args,
      fields: item.fields,
      where: item.where,
    });
    const resolved: LeafBase = { ...base, args, argsHash };
    const info = yield* ctx.host
      .lookup(item.operationId)
      .pipe(Effect.catch(() => Effect.succeed<ProposalOperationInfo>({ found: false })));
    if (!info.found) {
      return settle({
        ...resolved,
        state: "dropped",
        code: "unknown_operation",
        error: `Unknown operationId: ${item.operationId}`,
      });
    }
    const block = yield* checkProposalIfcEffect({
      operationId: item.operationId,
      info,
      programLabels: ctx.programLabels,
      sessionId: ctx.sessionId,
      env: ctx.env,
    });
    if (block) {
      return settle({
        ...resolved,
        state: "dropped",
        status: "blocked",
        code: "ifc_blocked",
        error: block.reason,
        fixHint: block.fix,
      });
    }

    const text = yield* hostText(
      ctx.host.execute(
        { operationId: item.operationId, args, fields: item.fields, where: item.where },
        { programId: ctx.programId, proposalId: item.id }
      )
    );
    return settle(leafFromOutcome(resolved, classifyOutcome(text, false), ctx.maxResultBytes));
  });
}

type Refusal = { readonly code: string; readonly error: string; readonly fixHint: string };

const REJECT_CODES: ReadonlySet<string> = new Set<ProposalRejectCode>([
  "unknown_operation",
  "ifc_blocked",
  "ref_unresolved",
  "dependency_rejected",
]);

/**
 * Client-held proposals (no stored record) are parsed like a plan's proposals. Entries
 * execute_program already rejected stay rejected without parsing their args, which may
 * still name read calls that do not exist in this scope.
 */
function proposalsFromEchoEffect(
  raw: unknown,
  maxProposals: number
): Effect.Effect<readonly ResolvedProposal[] | Refusal> {
  return Effect.gen(function* () {
    if (Array.isArray(raw) && raw.length > maxProposals) {
      return {
        code: "too_many_proposals",
        error: `more than ${maxProposals} proposals`,
        fixHint: "Split the batch or raise CLAWQL_PROGRAM_MAX_PROPOSALS.",
      };
    }
    const rejected = new Map<number, Record<string, unknown>>();
    const parseable = Array.isArray(raw)
      ? raw.map((item: unknown, i) => {
          if (!isRecord(item) || item.status !== "rejected") return item;
          rejected.set(i, item);
          const { args: _args, ...rest } = item;
          return rest;
        })
      : raw;
    const parsed = yield* parseProgramProposalsEffect(parseable);
    if ("ok" in parsed) {
      return { code: "invalid_proposals", error: parsed.error, fixHint: parsed.fixHint };
    }
    return parsed.map((p): ResolvedProposal => {
      const base = {
        id: p.id,
        index: p.index,
        operationId: p.operationId,
        args: p.args,
        ...(p.fields !== undefined ? { fields: p.fields } : {}),
        ...(p.where !== undefined ? { where: p.where } : {}),
        dependsOn: [...new Set(p.refs.map((s) => s.ref.target))],
      };
      const echo = rejected.get(p.index);
      if (!echo) return { ...base, status: p.refs.length > 0 ? "deferred" : "ready" };
      const code = str(echo.code);
      const fixHint = str(echo.fixHint);
      return {
        ...base,
        args: isRecord(echo.args) ? echo.args : {},
        status: "rejected",
        ...(code && REJECT_CODES.has(code) ? { code: code as ProposalRejectCode } : {}),
        error: str(echo.error) ?? "rejected by execute_program",
        ...(fixHint ? { fixHint } : {}),
      };
    });
  });
}

function refusal(
  programId: string,
  code: string,
  error: string,
  fixHint: string
): SubmitProgramProposalsResult {
  return {
    ok: false,
    complete: false,
    programId,
    leaves: [],
    summary: { ran: 0, failed: 0, dropped: 0, pending: 0 },
    code,
    error,
    fixHint,
  };
}

function digestShapeEffect(raw: unknown): Effect.Effect<string> {
  const o = isRecord(raw) ? raw : {};
  return hashPendingArgsEffect({
    operationId: typeof o.operationId === "string" ? o.operationId.trim() : "",
    args: isRecord(o.args) ? o.args : {},
    fields: Array.isArray(o.fields) ? (o.fields as string[]) : undefined,
    where: typeof o.where === "string" ? o.where : undefined,
  });
}

/** Echoed proposals must be exactly what execute_program stored for this programId. */
function matchesRecordEffect(
  raw: unknown,
  stored: readonly ResolvedProposal[]
): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    if (!Array.isArray(raw) || raw.length !== stored.length) return false;
    for (let i = 0; i < stored.length; i++) {
      const item: unknown = raw[i];
      if (!isRecord(item) || item.id !== stored[i]!.id) return false;
      if ((yield* digestShapeEffect(item)) !== (yield* digestShapeEffect(stored[i]))) return false;
    }
    return true;
  });
}

function viewOf(leaf: SubmittedLeaf, budget: number): SubmittedLeaf {
  if (leaf.result === undefined) return leaf;
  const json = JSON.stringify(leaf.result) ?? "";
  if (Buffer.byteLength(json, "utf8") <= budget) return leaf;
  const { result: _result, ...rest } = leaf;
  return { ...rest, resultTruncated: true, resultPreview: `${json.slice(0, 2048)}…` };
}

export function submitProgramProposalsEffect(
  input: SubmitProgramProposalsInput,
  host: ProgramSubmitHost,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<SubmitProgramProposalsResult> {
  return Effect.gen(function* () {
    const programId = typeof input.programId === "string" ? input.programId.trim() : "";
    if (!PROGRAM_ID_PATTERN.test(programId)) {
      return refusal(
        programId,
        "invalid_program_id",
        "programId must be the prog_… id returned by execute_program",
        "Pass programId from the execute_program result."
      );
    }
    const caps = yield* resolveProgramCapsEffect(env);
    const store = yield* currentProgramProposalStoreEffect;
    const owner = resolveSessionLabelKey(input.sessionId, env);

    return yield* store.withProgramLock(
      owner,
      programId,
      Effect.gen(function* () {
        const record = yield* store.get(owner, programId);
        let items: readonly ResolvedProposal[];
        if (record) {
          if (
            input.proposals !== undefined &&
            !(yield* matchesRecordEffect(input.proposals, record.proposals))
          ) {
            return refusal(
              programId,
              "proposals_mismatch",
              "proposals differ from what execute_program returned for this programId",
              "Omit proposals to submit the stored set, or run execute_program again."
            );
          }
          items = record.proposals;
        } else if (input.proposals === undefined) {
          return refusal(
            programId,
            "program_not_found",
            "no stored proposals for this programId in this session (expired, other replica, or other session)",
            "Pass the proposals array from the execute_program result, or run execute_program again."
          );
        } else {
          const echoed = yield* proposalsFromEchoEffect(input.proposals, caps.maxProposals);
          if ("code" in echoed) {
            return refusal(programId, echoed.code, echoed.error, echoed.fixHint);
          }
          items = echoed;
        }

        const leaves: Record<string, ProposalLeaf> = { ...record?.leaves };
        const ctx: SubmitContext = {
          programId,
          host,
          programLabels: record?.programLabels ?? [],
          sessionId: input.sessionId,
          env,
          maxResultBytes: caps.maxOutputBytes,
        };
        const advanced: SubmittedLeaf[] = [];
        for (const item of items) advanced.push(yield* advanceEffect(item, leaves, ctx));

        if (record) {
          yield* store.saveLeaves(owner, programId, leaves);
        } else {
          const now = Date.now();
          yield* store.put({
            programId,
            owner,
            createdAtMs: now,
            expiresAtMs: now + (yield* programProposalRecordTtlMsEffect(env)),
            programLabels: [],
            proposals: items,
            leaves,
          });
        }

        const count = (state: ProposalLeaf["state"]) =>
          advanced.filter((l) => l.state === state).length;
        const summary = {
          ran: count("ran"),
          failed: count("failed"),
          dropped: count("dropped"),
          pending: count("pending"),
        };
        const budget = Math.floor(caps.maxOutputBytes / Math.max(1, advanced.length));
        const digestRows = advanced
          .filter((l) => typeof l.argsHash === "string" && l.argsHash.length > 0)
          .map((l) => ({ id: l.id, argsHash: l.argsHash as string }));
        const batchMerkle =
          digestRows.length > 0
            ? {
                root: (yield* buildBatchMerkleEffect(digestRows.map((d) => d.argsHash))).root,
                leafCount: digestRows.length,
                digests: digestRows,
              }
            : undefined;
        const result: SubmitProgramProposalsResult = {
          ok: summary.failed === 0 && summary.dropped === 0,
          complete: summary.pending === 0,
          programId,
          leaves: advanced.map((l) => viewOf(l, budget)),
          summary,
          batchMerkle,
        };

        yield* appendProcessWormEffect({
          type: "TOOL_CALL_RESULT",
          timestamp: new Date().toISOString(),
          sessionId: input.sessionId ?? "",
          metadata: {
            source: "submit_program_proposals",
            programId,
            ok: result.ok,
            complete: result.complete,
            batchMerkleRoot: batchMerkle?.root,
            leaves: advanced.map((l) => ({
              id: l.id,
              operationId: l.operationId,
              state: l.state,
              argsHash: l.argsHash,
              executionId: l.executionId,
            })),
          },
        }).pipe(Effect.catch(() => Effect.void));

        return result;
      })
    );
  });
}

/**
 * {@link ProgramSubmitHost.pendingStatus} over the mandate store. A pending or approved
 * record past `expiresAt` reads as `expired`: the store only marks expiry when someone
 * decides or consumes it.
 */
export function parkedMandateStatusEffect(
  executionId: string,
  nowMs: number = Date.now()
): Effect.Effect<PendingExecutionStatus | null, Error, PendingExecutionService> {
  return Effect.gen(function* () {
    const pending = yield* PendingExecutionService;
    const record = yield* pending.load(executionId);
    if (!record) return null;
    const live = record.status === "pending" || record.status === "approved";
    return live && Date.parse(record.expiresAt) <= nowMs ? "expired" : record.status;
  });
}

export class ProgramSubmitService extends Context.Service<
  ProgramSubmitService,
  {
    readonly submit: (
      input: SubmitProgramProposalsInput,
      host: ProgramSubmitHost,
      env?: NodeJS.ProcessEnv
    ) => Effect.Effect<SubmitProgramProposalsResult>;
  }
>()("clawql/ProgramSubmitService") {}

export const ProgramSubmitLive = Layer.succeed(
  ProgramSubmitService,
  ProgramSubmitService.of({
    submit: (input, host, env) => submitProgramProposalsEffect(input, host, env),
  })
);
