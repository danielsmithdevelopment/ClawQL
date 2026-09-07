/**
 * spend-cap-enforce hook for action kind `outbound_payment`.
 */

import type {
  HookContext,
  HookResult,
  LifecycleHook,
  OutboundPaymentAction,
  OutboundPaymentHitlApproval,
  OutboundPaymentPolicyAccepted,
  OutboundSpendDecision,
} from "clawql-core";
import {
  evaluateOutboundPayment,
  OutboundPolicyError,
} from "clawql-core";
import { Effect } from "effect";
import { OutboundSpendCounterService, utcDayKey, type SpendCounterKey } from "./counters.js";
import { OutboundPolicyStoreService } from "./policy-store.js";

export const SPEND_CAP_ENFORCE_HOOK_ID = "spend-cap-enforce";
export const OUTBOUND_PAYMENT_TOOL_PATTERN = "^outbound-x402-pay$|^payments\\.outbound";

export type OutboundPaymentHookArgs = {
  readonly kind: "outbound_payment";
  readonly tenantId: string;
  readonly agentId: string;
  readonly resourceUrl: string;
  readonly method: string;
  readonly quote: OutboundPaymentAction["quote"];
  readonly hitlApproval?: OutboundPaymentHitlApproval;
};

function isOutboundArgs(value: unknown): value is OutboundPaymentHookArgs {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.kind === "outbound_payment" && typeof v.resourceUrl === "string";
}

export type SpendCapEvaluateInput = {
  readonly policy: OutboundPaymentPolicyAccepted;
  readonly action: OutboundPaymentAction;
};

export function spendCapDecisionToHookResult(
  decision: OutboundSpendDecision
): HookResult {
  if (decision.decision === "allow") {
    return { allow: true, meta: { hookDecision: "allow", reason: decision.reason } };
  }
  if (decision.decision === "hitl") {
    return {
      allow: false,
      denyReason: decision.reason,
      meta: { hookDecision: "hitl", reason: decision.reason },
    };
  }
  return {
    allow: false,
    denyReason: decision.reason,
    meta: { hookDecision: "deny", reason: decision.reason },
  };
}

/**
 * Pure evaluate path used by the batch runner (Effect services for counters/store).
 */
export function evaluateSpendCapOutboundEffect(input: {
  readonly tenantId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly args: OutboundPaymentHookArgs;
}): Effect.Effect<
  { result: HookResult; policyVersionId: string; decision: OutboundSpendDecision },
  OutboundPolicyError,
  OutboundPolicyStoreService | OutboundSpendCounterService
> {
  return Effect.gen(function* () {
    const store = yield* OutboundPolicyStoreService;
    const counters = yield* OutboundSpendCounterService;

    const accepted = yield* store.getPolicy(input.tenantId);
    if (!accepted) {
      const decision: OutboundSpendDecision = {
        decision: "deny",
        reason: "policy_missing",
      };
      return {
        result: spendCapDecisionToHookResult(decision),
        policyVersionId: "",
        decision,
      };
    }

    const tenantState = yield* store.getTenantState(input.tenantId);
    const key: SpendCounterKey = {
      tenantId: input.tenantId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      dayKey: utcDayKey(),
    };
    const totals = yield* counters.totals(key);

    const action: OutboundPaymentAction = {
      kind: "outbound_payment",
      resourceUrl: input.args.resourceUrl,
      method: input.args.method,
      quote: input.args.quote,
      hitlApproval: input.args.hitlApproval,
      outboundPaymentEverEnabled: tenantState.outboundPaymentEverEnabled,
      dayTotalUsdc: totals.dayTotalUsdc,
      sessionTotalUsdc: totals.sessionTotalUsdc,
    };

    const decision = yield* evaluateOutboundPayment(accepted.policy, action);
    return {
      result: spendCapDecisionToHookResult(decision),
      policyVersionId: accepted.versionId,
      decision,
    };
  });
}

/**
 * LifecycleHook factory. Prefer wiring via a host that provides store/counter
 * layers into `evaluateSpendCapOutboundEffect`. This hook closes over nothing —
 * the batch runner calls {@link evaluateSpendCapOutboundEffect} directly.
 * When registered, args must carry outbound_payment fields; missing services
 * surface as deny via catchAll.
 */
export function createSpendCapEnforceOutboundHook(): LifecycleHook {
  return {
    id: SPEND_CAP_ENFORCE_HOOK_ID,
    scope: "model",
    event: "pre-execute",
    toolPattern: OUTBOUND_PAYMENT_TOOL_PATTERN,
    blocking: true,
    handler: (ctx: HookContext) => {
      if (!isOutboundArgs(ctx.args)) {
        return Effect.succeed({
          allow: false,
          denyReason: "outbound_payment_args_missing",
          meta: { hookDecision: "deny" },
        } satisfies HookResult);
      }
      const args = ctx.args;
      // Services are provided by the payments host Layer when firing hooks.
      // Cast through unknown: LifecycleHook R is WormAuditSink-only in core.
      return (
        evaluateSpendCapOutboundEffect({
          tenantId: args.tenantId,
          agentId: args.agentId,
          sessionId: ctx.session.id,
          args,
        }).pipe(
          Effect.map((evaluated) => evaluated.result),
          Effect.catchAll((err: OutboundPolicyError) =>
            Effect.succeed({
              allow: false,
              denyReason: err.reason,
              meta: { hookDecision: "deny" },
            } satisfies HookResult)
          )
        ) as unknown as Effect.Effect<HookResult, Error>
      );
    },
  };
}
