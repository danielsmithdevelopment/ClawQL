/**
 * Execute-path session IFC gate (ADR 0015 § Information flow / Session-level labeling).
 *
 * Gated by `CLAWQL_ENABLE_SESSION_IFC=1` (default off for safe rollout).
 */

import { Effect } from "effect";
import type { Operation } from "../spec/operation-types.js";
import {
  labelForSpec,
  mayFlow,
  parseIfcFlowConfigJson,
  PUBLIC_LABEL,
  type Label,
} from "./labels.js";
import {
  accumulateSessionLabelsSync,
  getSessionLabelsSync,
  resolveSessionLabelKey,
} from "./session-label-store.js";

function envTruthy(v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = v.trim().toLowerCase();
  return t === "1" || t === "true" || t === "yes";
}

/** Whether session IFC is active. Default off; set `CLAWQL_ENABLE_SESSION_IFC=1`. */
export function sessionIfcEnabledEffect(
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<boolean> {
  return Effect.sync(() => envTruthy(env.CLAWQL_ENABLE_SESSION_IFC));
}

/**
 * Read = non-mutating. Mirrors operation-risk defaults: GET/HEAD/QUERY and
 * explicit read-only hints accumulate; everything else is a write sink check.
 */
export function isReadOperation(op: Pick<Operation, "method" | "riskHints" | "nativeGraphQL">): boolean {
  if (op.riskHints?.mcpReadOnlyHint === true) return true;
  if (op.riskHints?.grpcNoSideEffects === true) return true;
  if (op.nativeGraphQL?.operationType === "query") return true;
  const m = op.method.trim().toUpperCase();
  return m === "GET" || m === "HEAD" || m === "QUERY";
}

export function dataLabelsForOperation(op: Pick<Operation, "specLabel">): Label[] {
  return [labelForSpec(op.specLabel)];
}

export function destLabelsForOperation(op: Pick<Operation, "specLabel">): ReadonlySet<Label> {
  const label = labelForSpec(op.specLabel);
  // Unknown / missing sinks are not public — fail closed when tainted.
  if (!op.specLabel?.trim()) {
    return new Set([label]);
  }
  const lower = op.specLabel.trim().toLowerCase();
  if (lower === "public" || lower === "source:public") {
    return new Set([PUBLIC_LABEL]);
  }
  return new Set([label]);
}

export type SessionIfcBlock = {
  readonly ok: false;
  readonly status: "blocked";
  readonly reason: string;
  readonly operationId: string;
  readonly sessionKey: string;
  readonly sessionLabels: string[];
  readonly destLabels: string[];
  readonly fix: string;
};

/**
 * Before a mutating execute: fail closed when session labels may not flow to dest.
 * Returns a block payload, or `null` when allowed / IFC disabled / read op.
 */
export function checkSessionIfcWriteSync(opts: {
  readonly operation: Operation;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
}): SessionIfcBlock | null {
  const env = opts.env ?? process.env;
  if (!envTruthy(env.CLAWQL_ENABLE_SESSION_IFC)) return null;
  if (isReadOperation(opts.operation)) return null;

  const sessionKey = resolveSessionLabelKey(opts.sessionId, env);
  const fromUnion = getSessionLabelsSync(sessionKey);
  const destLabels = destLabelsForOperation(opts.operation);
  const config = parseIfcFlowConfigJson(env.CLAWQL_SESSION_IFC_ALLOWED);
  if (mayFlow(fromUnion, destLabels, config)) return null;

  return {
    ok: false,
    status: "blocked",
    reason:
      "Session information-flow policy blocked this write: accumulated read labels may not flow to the destination (ADR 0015).",
    operationId: opts.operation.id,
    sessionKey,
    sessionLabels: [...fromUnion].sort(),
    destLabels: [...destLabels].sort(),
    fix: "Use a destination that accepts these labels, clear the session, or disable CLAWQL_ENABLE_SESSION_IFC (not recommended in production).",
  };
}

/**
 * After a successful read execute: union op data labels into the session set.
 * No-op when IFC disabled, write ops, or unsuccessful outcomes.
 */
export function accumulateSessionIfcReadSync(opts: {
  readonly operation: Operation;
  readonly sessionId?: string;
  readonly success: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): ReadonlySet<Label> | null {
  const env = opts.env ?? process.env;
  if (!envTruthy(env.CLAWQL_ENABLE_SESSION_IFC)) return null;
  if (!opts.success) return null;
  if (!isReadOperation(opts.operation)) return null;

  const sessionKey = resolveSessionLabelKey(opts.sessionId, env);
  return accumulateSessionLabelsSync(sessionKey, dataLabelsForOperation(opts.operation));
}

/** Effect wrappers for domain consistency. */
export const checkSessionIfcWriteEffect = (opts: {
  readonly operation: Operation;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<SessionIfcBlock | null> => Effect.sync(() => checkSessionIfcWriteSync(opts));

export const accumulateSessionIfcReadEffect = (opts: {
  readonly operation: Operation;
  readonly sessionId?: string;
  readonly success: boolean;
  readonly env?: NodeJS.ProcessEnv;
}): Effect.Effect<ReadonlySet<Label> | null> =>
  Effect.sync(() => accumulateSessionIfcReadSync(opts));
