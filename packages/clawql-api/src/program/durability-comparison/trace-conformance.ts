/**
 * TrialTraceEvent → WriteProtocol safety checks (TypeScript bridge to TLA+).
 *
 * Not a full TLC replay — checks the same safety rules the model encodes:
 * NoDuplicateEffect, NoFalseDone, NoUnsafeRetry (early not_found → safe_resend),
 * and GuaranteeNamed (definitive only with a named server reason).
 *
 * Claim style: conformance under these rules — not "provably correct."
 */

import { Effect } from "effect";
import type { ApiCapability, TrialTraceEvent } from "./types.js";

export type TraceConformanceViolation = {
  readonly rule:
    | "NoDuplicateEffect"
    | "NoFalseDone"
    | "NoUnsafeRetry"
    | "GuaranteeNamed"
    | "StructuralNoBlindRetry";
  readonly atIndex: number;
  readonly kind: TrialTraceEvent["kind"];
  readonly detail: string;
};

export type TraceConformanceResult = {
  readonly ok: boolean;
  readonly eventsChecked: number;
  readonly violations: readonly TraceConformanceViolation[];
};

export type TraceConformanceInput = {
  readonly events: readonly TrialTraceEvent[];
  readonly apiCapability: ApiCapability;
  /** Structural ClawQL gate must never emit agent_retry that applies a write. */
  readonly structuralGate?: boolean;
};

const NAMED_GUARANTEE_RE = /server_enforced_expiry|lookup_covers_prior_accepts|connection_rejected/;

/**
 * Check one trial's event log against WriteProtocol safety rules.
 * Pure: returns violations; does not throw.
 */
export function checkTrialTrace(input: TraceConformanceInput): TraceConformanceResult {
  const violations: TraceConformanceViolation[] = [];
  const appliedByRef = new Map<string, number>();
  let sawLookupNotFound = false;
  let sawDefinitiveGuarantee = false;
  let lastLookupDefinitive = false;
  let lastLookupFound = false;

  for (let i = 0; i < input.events.length; i++) {
    const ev = input.events[i]!;
    switch (ev.kind) {
      case "request_applied": {
        const key = ev.reference ?? ev.detail ?? `anon-${i}`;
        const n = (appliedByRef.get(key) ?? 0) + 1;
        appliedByRef.set(key, n);
        if (n > 1 && input.apiCapability !== "idempotency_keys") {
          violations.push({
            rule: "NoDuplicateEffect",
            atIndex: i,
            kind: ev.kind,
            detail: `reference=${key} applied=${n} (apiCapability=${input.apiCapability})`,
          });
        }
        break;
      }
      case "lookup": {
        sawLookupNotFound = ev.found === false;
        lastLookupFound = ev.found === true;
        lastLookupDefinitive = ev.definitive === true;
        if (ev.definitive === true) {
          const detail = ev.detail ?? "";
          if (!NAMED_GUARANTEE_RE.test(detail)) {
            violations.push({
              rule: "GuaranteeNamed",
              atIndex: i,
              kind: ev.kind,
              detail:
                "definitive lookup requires a named server guarantee in detail " +
                "(server_enforced_expiry | lookup_covers_prior_accepts | connection_rejected)",
            });
          } else {
            sawDefinitiveGuarantee = true;
          }
        }
        break;
      }
      case "safe_resend": {
        // LookupNotFoundSafe requires canNoLongerLand (named ServerGuarantee).
        if (!sawDefinitiveGuarantee || !lastLookupDefinitive || lastLookupFound) {
          violations.push({
            rule: "NoUnsafeRetry",
            atIndex: i,
            kind: ev.kind,
            detail:
              "safe_resend without a prior definitive not_found + named ServerGuarantee " +
              `(sawLookupNotFound=${sawLookupNotFound} definitive=${lastLookupDefinitive})`,
          });
        }
        break;
      }
      case "reconciled": {
        // NoFalseDone: reconciled implies the charge was found or safely resent.
        if (!lastLookupFound && !sawDefinitiveGuarantee && input.apiCapability === "lookup_race") {
          violations.push({
            rule: "NoFalseDone",
            atIndex: i,
            kind: ev.kind,
            detail: "reconciled on lookup_race without found or named guarantee",
          });
        }
        break;
      }
      case "agent_retry": {
        if (input.structuralGate === true) {
          violations.push({
            rule: "StructuralNoBlindRetry",
            atIndex: i,
            kind: ev.kind,
            detail: "ClawQL structural gate must refuse blind agent_retry (AgentRetryRefused)",
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    ok: violations.length === 0,
    eventsChecked: input.events.length,
    violations,
  };
}

/** Effect wrapper for Effect-everywhere packages. */
export const checkTrialTraceEffect = (
  input: TraceConformanceInput
): Effect.Effect<TraceConformanceResult> => Effect.sync(() => checkTrialTrace(input));

/**
 * Aggregate many trials: fail if any measured trial with events violates safety.
 * Trials without events are skipped (trace export off).
 */
export function checkTrialTraces(
  trials: readonly {
    readonly events?: readonly TrialTraceEvent[];
    readonly detail?: string;
  }[],
  opts: { readonly apiCapability: ApiCapability; readonly structuralGate?: boolean }
): TraceConformanceResult {
  const violations: TraceConformanceViolation[] = [];
  let eventsChecked = 0;
  for (const trial of trials) {
    if (!trial.events || trial.events.length === 0) continue;
    const r = checkTrialTrace({
      events: trial.events,
      apiCapability: opts.apiCapability,
      structuralGate: opts.structuralGate,
    });
    eventsChecked += r.eventsChecked;
    for (const v of r.violations) {
      violations.push({
        ...v,
        detail: `${v.detail}${trial.detail ? ` | trial=${trial.detail}` : ""}`,
      });
    }
  }
  return { ok: violations.length === 0, eventsChecked, violations };
}
