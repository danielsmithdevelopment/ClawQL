/**
 * Proposed writes (ADR 0015 § Proposed writes, § Dependent writes via proposal references).
 *
 * Programs never run proposals. After the reads, `execute_program` fills every `$ref` it
 * can (read call results, earlier proposals' args), binds each fully resolved proposal to
 * the args digest execute would park, checks session IFC against everything the program
 * read, and returns the set. `<proposal>.result` refs stay deferred until
 * `submit_program_proposals` has run that proposal through normal execute.
 */

import { Effect } from "effect";
import { labelForSpec, type Label } from "../ifc/labels.js";
import {
  checkSessionIfcWriteEffect,
  dataLabelsForOperation,
  isReadOperation,
  sessionIfcEnabledEffect,
  type SessionIfcBlock,
} from "../ifc/session-ifc-enforce.js";
import { hashPendingArgsEffect } from "../pending/args-hash.js";
import type { OperationRisk, OperationRiskPolicy } from "../risk/operation-risk-types.js";
import type { ProgramOperationInfo } from "./program-ifc.js";
import type { ProgramPlanProposal } from "./program-plan.js";
import {
  readProposalRefPathEffect,
  substituteProposalRefsEffect,
  type ProposalRefScalar,
  type ProposalRefSite,
} from "./program-refs.js";

/**
 * `ready`: fully resolved and bound to `argsHash`. `deferred`: waits on an earlier
 * proposal's execute result. `rejected`: will not run (fail closed).
 */
export type ProposalStatus = "ready" | "deferred" | "rejected";

export type ProposalRejectCode =
  "unknown_operation" | "ifc_blocked" | "ref_unresolved" | "dependency_rejected";

/** A placeholder still in `args`: JSON Pointer plus the raw `$ref` string. */
export type ProposalPendingRef = { readonly at: string; readonly ref: string };

export type ResolvedProposal = {
  readonly id: string;
  readonly index: number;
  readonly operationId: string;
  readonly status: ProposalStatus;
  /** Post-resolution args; deferred placeholders stay as `{ "$ref": … }`. */
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  /** Digest execute parks for exactly these args (`ready` only). */
  readonly argsHash?: string;
  /** Ids of the calls and proposals this proposal reads from. */
  readonly dependsOn: readonly string[];
  /** Placeholders filled at submit from earlier proposals (`deferred` only). */
  readonly pendingRefs?: readonly ProposalPendingRef[];
  /** Risk policy execute applies at submit (`mandate` parks for approval). */
  readonly policy?: OperationRiskPolicy;
  readonly risk?: OperationRisk;
  readonly code?: ProposalRejectCode;
  readonly error?: string;
  readonly fixHint?: string;
  readonly ifc?: SessionIfcBlock;
};

/** What `ProgramHost.resolveRisk` returns for an operationId. */
export type ProposalOperationInfo = {
  readonly found: boolean;
  readonly policy?: OperationRiskPolicy;
  readonly risk?: OperationRisk;
  /**
   * Needed for session IFC. Without it a read counts as `source:unknown` and a
   * proposal as a write to a destination that accepts no labels (fail closed).
   */
  readonly operation?: ProgramOperationInfo;
};

export type ProposalOperationLookup = (
  operationId: string
) => Effect.Effect<ProposalOperationInfo, Error>;

/** A read call as the program observed it; `<id>.result` refs read `value`. */
export type ProgramCallView = {
  readonly id: string;
  readonly tool: "execute" | "search";
  readonly operationId?: string;
  readonly ok: boolean;
  readonly value: unknown;
};

export type ResolveProgramProposalsInput = {
  readonly proposals: readonly ProgramPlanProposal[];
  readonly calls: readonly ProgramCallView[];
  readonly lookup: ProposalOperationLookup;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
};

export type ResolvedProgramProposals = {
  readonly proposals: readonly ResolvedProposal[];
  /** Union of source labels the program read; empty unless session IFC is on. */
  readonly programLabels: readonly Label[];
};

/** Per-leaf state once a proposal has been submitted (ADR 0015 § Batches are not atomic). */
export type ProposalLeafState = "ran" | "failed" | "dropped" | "pending";

export type ProposalLeaf = {
  readonly id: string;
  readonly index: number;
  readonly operationId: string;
  readonly state: ProposalLeafState;
  /** Final post-resolution args — what execute saw. */
  readonly args: Record<string, unknown>;
  readonly fields?: readonly string[];
  readonly where?: string;
  readonly argsHash?: string;
  /** Parked mandate while `pending`; the consumed one once it ran. */
  readonly executionId?: string;
  /** Execute / mandate status behind the state, e.g. `mandate_required`, `blocked`, `declined`. */
  readonly status?: string;
  readonly code?: string;
  readonly error?: string;
  readonly fixHint?: string;
  readonly approval?: unknown;
  readonly expiresAt?: string;
  /** Execute result kept for `<id>.result` refs (`ran` only). */
  readonly result?: unknown;
  readonly resultCaptured?: boolean;
};

const REF_FIX_HINT =
  "Point the $ref at a field holding one JSON value (string, number, boolean, or null).";

function pointerOf(path: readonly string[]): string {
  return path.map((s) => `/${s.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

function readsPendingPlaceholder(pointer: string, pending: readonly ProposalPendingRef[]): boolean {
  return pending.some((p) => pointer === p.at || pointer.startsWith(`${p.at}/`));
}

const lookupOrMissing =
  (lookup: ProposalOperationLookup) =>
  (operationId: string): Effect.Effect<ProposalOperationInfo> =>
    lookup(operationId).pipe(
      Effect.catch(() => Effect.succeed<ProposalOperationInfo>({ found: false }))
    );

/**
 * Labels for everything the program read: the source label of every read the host was
 * asked to run (only `allow` operations reach it), whether or not it succeeded.
 * Conservative on purpose (ADR 0015 § Program memory) — read or not, its data is in
 * program memory. Same labeling as the in-program write gate (program-ifc.ts).
 */
export function programReadLabelsEffect(
  calls: readonly ProgramCallView[],
  lookup: ProposalOperationLookup
): Effect.Effect<readonly Label[]> {
  return Effect.gen(function* () {
    const find = lookupOrMissing(lookup);
    const labels = new Set<Label>();
    for (const call of calls) {
      if (call.tool !== "execute" || !call.operationId) continue;
      const info = yield* find(call.operationId);
      if (!info.found || info.policy !== "allow") continue;
      const op = info.operation;
      if (!op) labels.add(labelForSpec(undefined));
      else if (isReadOperation(op))
        for (const label of dataLabelsForOperation(op)) labels.add(label);
    }
    return [...labels].sort();
  });
}

/** Session IFC for one proposal destination against session ∪ program labels; `null` = allowed. */
export function checkProposalIfcEffect(opts: {
  readonly operationId: string;
  readonly info: ProposalOperationInfo;
  readonly programLabels: readonly Label[];
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<SessionIfcBlock | null> {
  const op = opts.info.operation;
  return checkSessionIfcWriteEffect({
    operation: { id: opts.operationId, ...(op ?? { method: "POST" }) },
    ...(op ? {} : { destLabels: new Set<Label>() }),
    sessionId: opts.sessionId,
    env: opts.env,
    programLabels: opts.programLabels,
  });
}

type ResolveContext = {
  readonly calls: ReadonlyMap<string, ProgramCallView>;
  readonly done: ReadonlyMap<string, ResolvedProposal>;
  readonly ifc?: {
    readonly programLabels: readonly Label[];
    readonly sessionId?: string;
    readonly env: NodeJS.ProcessEnv;
  };
};

function resolveOneEffect(
  proposal: ProgramPlanProposal,
  info: ProposalOperationInfo,
  ctx: ResolveContext
): Effect.Effect<ResolvedProposal> {
  return Effect.gen(function* () {
    const base = {
      id: proposal.id,
      index: proposal.index,
      operationId: proposal.operationId,
      args: proposal.args,
      ...(proposal.fields !== undefined ? { fields: proposal.fields } : {}),
      ...(proposal.where !== undefined ? { where: proposal.where } : {}),
      dependsOn: [...new Set(proposal.refs.map((s) => s.ref.target))],
      ...(info.policy !== undefined ? { policy: info.policy } : {}),
      ...(info.risk !== undefined ? { risk: info.risk } : {}),
    };
    const reject = (
      code: ProposalRejectCode,
      error: string,
      fixHint: string,
      ifc?: SessionIfcBlock
    ): ResolvedProposal => ({
      ...base,
      status: "rejected",
      code,
      error,
      fixHint,
      ...(ifc ? { ifc } : {}),
    });

    if (!info.found) {
      return reject(
        "unknown_operation",
        `Unknown operationId: ${proposal.operationId}`,
        "Call search first and propose a cataloged operationId."
      );
    }
    if (ctx.ifc) {
      const block = yield* checkProposalIfcEffect({
        operationId: proposal.operationId,
        info,
        programLabels: ctx.ifc.programLabels,
        sessionId: ctx.ifc.sessionId,
        env: ctx.ifc.env,
      });
      if (block) return reject("ifc_blocked", block.reason, block.fix, block);
    }

    const values = new Map<string, ProposalRefScalar>();
    const pending: ProposalRefSite[] = [];
    for (const site of proposal.refs) {
      const { target, root, path, raw } = site.ref;
      const label = `args${site.at}: $ref "${raw}"`;
      const call = ctx.calls.get(target);
      if (call) {
        if (!call.ok) {
          return reject(
            "ref_unresolved",
            `${label} — read call ${target} failed`,
            "Fix the read call, or drop this proposal."
          );
        }
        const read = yield* readProposalRefPathEffect(call.value, path);
        if (!read.ok) return reject("ref_unresolved", `${label} — ${read.error}`, REF_FIX_HINT);
        values.set(site.at, read.value);
        continue;
      }
      const dep = ctx.done.get(target);
      if (!dep) {
        return reject("ref_unresolved", `${label} — unknown target "${target}"`, REF_FIX_HINT);
      }
      if (dep.status === "rejected") {
        return reject(
          "dependency_rejected",
          `${label} — proposal ${target} was rejected`,
          `Fix proposal ${target} first.`
        );
      }
      if (
        root === "result" ||
        (dep.status === "deferred" &&
          readsPendingPlaceholder(pointerOf(path), dep.pendingRefs ?? []))
      ) {
        pending.push(site);
        continue;
      }
      const read = yield* readProposalRefPathEffect(dep.args, path);
      if (!read.ok) return reject("ref_unresolved", `${label} — ${read.error}`, REF_FIX_HINT);
      values.set(site.at, read.value);
    }

    const args = yield* substituteProposalRefsEffect(proposal.args, values);
    if (pending.length > 0) {
      return {
        ...base,
        status: "deferred",
        args,
        pendingRefs: pending.map((s) => ({ at: s.at, ref: s.ref.raw })),
      };
    }
    const argsHash = yield* hashPendingArgsEffect({
      operationId: proposal.operationId,
      args,
      fields: proposal.fields,
      where: proposal.where,
    });
    return { ...base, status: "ready", args, argsHash };
  });
}

/**
 * Resolve a plan's proposals against the program's read results, in plan order (refs
 * only point backwards, so plan order is a topological order).
 */
export function resolveProgramProposalsEffect(
  input: ResolveProgramProposalsInput
): Effect.Effect<ResolvedProgramProposals> {
  return Effect.gen(function* () {
    const env = input.env ?? process.env;
    const find = lookupOrMissing(input.lookup);
    const ifcOn = yield* sessionIfcEnabledEffect(env);
    const programLabels = ifcOn ? yield* programReadLabelsEffect(input.calls, input.lookup) : [];
    const done = new Map<string, ResolvedProposal>();
    const ctx: ResolveContext = {
      calls: new Map(input.calls.map((c) => [c.id, c])),
      done,
      ...(ifcOn ? { ifc: { programLabels, sessionId: input.sessionId, env } } : {}),
    };
    for (const proposal of input.proposals) {
      const info = yield* find(proposal.operationId);
      done.set(proposal.id, yield* resolveOneEffect(proposal, info, ctx));
    }
    return { proposals: [...done.values()], programLabels };
  });
}
