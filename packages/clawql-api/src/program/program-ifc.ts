/**
 * Program-level session IFC (ADR 0015 § Program memory).
 *
 * Plain execute labels the session as each read lands, so call order decides what a
 * later write may carry. A plan can fan reads out in parallel or list the write first,
 * so per-call session checks alone would let a write reach the host before the reads
 * that taint it. With `CLAWQL_ENABLE_SESSION_IFC=1` the runner labels the program with
 * every source it plans to read and checks each in-program write against that union
 * before the host is called. Labels already in the session are still enforced by the
 * host's own execute path.
 */

import { Effect } from "effect";
import { labelForSpec, mayFlow, parseIfcFlowConfigJson, type Label } from "../ifc/labels.js";
import {
  dataLabelsForOperation,
  destLabelsForOperation,
  isReadOperation,
  sessionIfcEnabledEffect,
} from "../ifc/session-ifc-enforce.js";
import type { Operation } from "../spec/operation-types.js";
import type { ProgramPlan } from "./program-plan.js";
import type { ProgramHost } from "./program-runner.js";

/** Operation facts the session IFC classifiers need, returned by `ProgramHost.resolveRisk`. */
export type ProgramOperationInfo = Pick<
  Operation,
  "method" | "specLabel" | "riskHints" | "nativeGraphQL"
>;

/** Result an in-program write gets instead of reaching the host. */
export type ProgramIfcBlock = {
  readonly ok: false;
  readonly status: "program_ifc_blocked";
  readonly reason: string;
  readonly operationId: string;
  readonly programLabels: readonly Label[];
  readonly destLabels: readonly Label[];
  readonly fix: string;
};

type ProgramRiskInfo = Effect.Success<ReturnType<ProgramHost["resolveRisk"]>>;

type ProgramIfcGate = {
  readonly risks: ReadonlyMap<string, ProgramRiskInfo>;
  readonly blocked: ReadonlyMap<string, ProgramIfcBlock>;
};

type OperationFlow = {
  readonly operationId: string;
  /** Labels the program carries once this operation has run as a read. */
  readonly reads: readonly Label[];
  /** Destination labels when the operation may write; `null` for known reads. */
  readonly dest: ReadonlySet<Label> | null;
};

const BLOCK_REASON =
  "Program information-flow policy blocked this write: the program reads sources whose labels may not flow to the destination (ADR 0015).";

const BLOCK_FIX =
  "Write to a destination that accepts these labels, run this write before (not alongside) reads it does not depend on, or extend CLAWQL_SESSION_IFC_ALLOWED.";

/**
 * Without operation facts a call could be either kind, so it counts as an
 * unknown-source read and as a write to a destination that accepts no labels.
 */
function operationFlow(operationId: string, info: ProgramRiskInfo): OperationFlow {
  const op = info.operation;
  if (!op) return { operationId, reads: [labelForSpec(undefined)], dest: new Set() };
  return isReadOperation(op)
    ? { operationId, reads: dataLabelsForOperation(op), dest: null }
    : { operationId, reads: [], dest: destLabelsForOperation(op) };
}

function programIfcGateEffect(
  plan: ProgramPlan,
  host: ProgramHost,
  env: NodeJS.ProcessEnv
): Effect.Effect<ProgramIfcGate> {
  return Effect.gen(function* () {
    const operationIds = new Set(
      plan.calls.flatMap((call) => (call.tool === "execute" ? [call.operationId] : []))
    );
    const risks = new Map<string, ProgramRiskInfo>();
    for (const operationId of operationIds) {
      const info = yield* host
        .resolveRisk(operationId)
        .pipe(Effect.catch(() => Effect.succeed<ProgramRiskInfo>({ found: false })));
      risks.set(operationId, info);
    }

    // Only `allow` operations run inside a program; the runner rejects the rest first.
    const flows = [...risks].flatMap(([operationId, info]) =>
      info.found && info.policy === "allow" ? [operationFlow(operationId, info)] : []
    );
    const config = parseIfcFlowConfigJson(env.CLAWQL_SESSION_IFC_ALLOWED);
    const blocked = new Map<string, ProgramIfcBlock>();
    for (const { operationId, dest } of flows) {
      if (!dest) continue;
      // Every call to one operation is the same kind (a read is never checked, a write
      // adds no label), so an operation's own label is left out of its check.
      const programLabels = new Set(
        flows.flatMap((flow) => (flow.operationId === operationId ? [] : flow.reads))
      );
      if (mayFlow(programLabels, dest, config)) continue;
      blocked.set(operationId, {
        ok: false,
        status: "program_ifc_blocked",
        reason: BLOCK_REASON,
        operationId,
        programLabels: [...programLabels].sort(),
        destLabels: [...dest].sort(),
        fix: BLOCK_FIX,
      });
    }
    return { risks, blocked };
  });
}

/**
 * Wrap `host` for one plan. The first execute resolves risk once per operation (inside
 * the program's timeout, and shared with the runner's read-only check so both see the
 * same facts); writes the program's read labels may not flow to then get a
 * {@link ProgramIfcBlock} instead of reaching the host. Returns `host` unchanged when
 * session IFC is off.
 */
export function programIfcHostEffect(
  plan: ProgramPlan,
  host: ProgramHost,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<ProgramHost> {
  return Effect.gen(function* () {
    if (!(yield* sessionIfcEnabledEffect(env))) return host;
    const gate = yield* Effect.cached(programIfcGateEffect(plan, host, env));
    return {
      ...host,
      resolveRisk: (operationId) =>
        gate.pipe(
          Effect.flatMap(({ risks }) => {
            const info = risks.get(operationId);
            return info ? Effect.succeed(info) : host.resolveRisk(operationId);
          })
        ),
      execute: (input, ctx) =>
        gate.pipe(
          Effect.flatMap(({ blocked }) => {
            const block = blocked.get(input.operationId);
            return block
              ? Effect.succeed({
                  content: [{ type: "text" as const, text: JSON.stringify(block) }],
                })
              : host.execute(input, ctx);
          })
        ),
    };
  });
}
