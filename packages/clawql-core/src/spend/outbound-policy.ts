/**
 * Outbound payment policy + spend-cap evaluation (loader-enforced).
 * @see docs/specs/spend/spend-governance-v0.1.md
 */

import { createHash } from "node:crypto";
import { Context, Data, Effect, Layer } from "effect";
import { ConfigError } from "../errors/clawql-error.js";

/** Policy governing money leaving a tenant via x402/MPP. Narrowing only. */
export type OutboundPaymentPolicy = {
  readonly hostsAllowlist: readonly string[];
  readonly payToAllowlist: readonly string[];
  readonly networksAllowlist: readonly string[];
  readonly assetsAllowlist: readonly string[];
  /** Decimal USDC string (e.g. "0.05"). */
  readonly maxUsdcPerCall: string;
  readonly maxUsdcPerDay: string;
  readonly maxUsdcPerSession: string;
  /** HITL when amount ≥ this decimal; below may auto-sign if other checks pass. */
  readonly humanApprovalAboveUsdc: string;
  /**
   * Loader-enforced. Rejected unless strict `true`.
   * TypeScript alone is not sufficient — JSON overlays must pass the same check.
   */
  readonly requireDocumentedJustification: true;
  /** Opaque justification artifact id (ticket, commit trailer, signed note). */
  readonly documentedJustificationId: string;
};

export type OutboundPaymentPolicyAccepted = {
  readonly versionId: string;
  readonly policy: OutboundPaymentPolicy;
  readonly acceptedAt: string;
};

export type OutboundPaymentQuote = {
  readonly payTo: string;
  readonly network: string;
  readonly asset: string;
  /** Decimal USDC string. */
  readonly amountUsdc: string;
  readonly digest: string;
};

export type OutboundPaymentHitlApproval = {
  readonly quoteDigest: string;
  readonly approvedAt: string;
};

/** Synthetic action for `spend-cap-enforce` / `outbound_payment`. */
export type OutboundPaymentAction = {
  readonly kind: "outbound_payment";
  readonly resourceUrl: string;
  readonly method: string;
  readonly quote: OutboundPaymentQuote;
  readonly hitlApproval?: OutboundPaymentHitlApproval;
  /** False until first enablement ceremony completes — forces HITL regardless of amount. */
  readonly outboundPaymentEverEnabled: boolean;
  /** Reserved + settled day total (decimal USDC) before this call. */
  readonly dayTotalUsdc: string;
  /** Reserved + settled session total (decimal USDC) before this call. */
  readonly sessionTotalUsdc: string;
};

export type OutboundSpendDecision =
  | { readonly decision: "allow"; readonly reason?: string }
  | { readonly decision: "deny"; readonly reason: string }
  | { readonly decision: "hitl"; readonly reason: string };

export class OutboundPolicyError extends Data.TaggedError("OutboundPolicyError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

const USDC_SCALE = 1_000_000n;

/** Parse a non-negative decimal USDC string to micro-units. */
export function parseUsdcToAtomic(value: string): Effect.Effect<bigint, OutboundPolicyError> {
  return Effect.gen(function* () {
    const trimmed = value.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return yield* Effect.fail(
        new OutboundPolicyError({ reason: `invalid_usdc_amount:${value}` })
      );
    }
    const [whole, frac = ""] = trimmed.split(".");
    if (frac.length > 6) {
      return yield* Effect.fail(
        new OutboundPolicyError({ reason: `usdc_too_many_fraction_digits:${value}` })
      );
    }
    const fracPadded = (frac + "000000").slice(0, 6);
    return BigInt(whole) * USDC_SCALE + BigInt(fracPadded);
  });
}

export function compareUsdcDecimal(
  a: string,
  b: string
): Effect.Effect<-1 | 0 | 1, OutboundPolicyError> {
  return Effect.gen(function* () {
    const aa = yield* parseUsdcToAtomic(a);
    const bb = yield* parseUsdcToAtomic(b);
    if (aa < bb) return -1 as const;
    if (aa > bb) return 1 as const;
    return 0 as const;
  });
}

export function addUsdcDecimal(a: string, b: string): Effect.Effect<string, OutboundPolicyError> {
  return Effect.gen(function* () {
    const sum = (yield* parseUsdcToAtomic(a)) + (yield* parseUsdcToAtomic(b));
    const whole = sum / USDC_SCALE;
    const frac = (sum % USDC_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
    return frac.length === 0 ? whole.toString() : `${whole}.${frac}`;
  });
}

/** Exact host or `*.suffix` (matches `api.example.com` for `*.example.com`). */
export function hostMatchesAllowlist(host: string, allowlist: readonly string[]): boolean {
  const h = host.trim().toLowerCase();
  if (!h || allowlist.length === 0) return false;
  for (const entry of allowlist) {
    const e = entry.trim().toLowerCase();
    if (!e) continue;
    if (e.startsWith("*.")) {
      const suffix = e.slice(1); // ".example.com"
      if (h.endsWith(suffix) && h.length > suffix.length) return true;
      continue;
    }
    if (h === e) return true;
  }
  return false;
}

export function hostFromResourceUrl(resourceUrl: string): string | null {
  try {
    return new URL(resourceUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function normalizeAllowlist(list: readonly string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

function isSubset(child: readonly string[], parent: readonly string[]): boolean {
  const p = new Set(parent.map((s) => s.trim().toLowerCase()));
  for (const c of child) {
    if (!p.has(c.trim().toLowerCase())) return false;
  }
  return true;
}

function policyVersionId(policy: OutboundPaymentPolicy): string {
  const canonical = JSON.stringify({
    hostsAllowlist: [...policy.hostsAllowlist].sort(),
    payToAllowlist: [...policy.payToAllowlist].sort(),
    networksAllowlist: [...policy.networksAllowlist].sort(),
    assetsAllowlist: [...policy.assetsAllowlist].sort(),
    maxUsdcPerCall: policy.maxUsdcPerCall,
    maxUsdcPerDay: policy.maxUsdcPerDay,
    maxUsdcPerSession: policy.maxUsdcPerSession,
    humanApprovalAboveUsdc: policy.humanApprovalAboveUsdc,
    requireDocumentedJustification: true,
    documentedJustificationId: policy.documentedJustificationId,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Load and validate outbound payment policy. Rejects widen/omit of justification.
 * Pure Effect — no IO.
 */
export function loadOutboundPaymentPolicy(
  raw: unknown,
  previous: OutboundPaymentPolicy | null = null
): Effect.Effect<OutboundPaymentPolicyAccepted, OutboundPolicyError | ConfigError> {
  return Effect.gen(function* () {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return yield* Effect.fail(
        new ConfigError({ reason: "outbound_policy_not_object", key: "OutboundPaymentPolicy" })
      );
    }
    const obj = raw as Record<string, unknown>;

    if (obj.requireDocumentedJustification !== true) {
      return yield* Effect.fail(
        new OutboundPolicyError({
          reason:
            "requireDocumentedJustification_must_be_true — loader rejects false, omit, or non-boolean",
        })
      );
    }

    const justification =
      typeof obj.documentedJustificationId === "string" ? obj.documentedJustificationId.trim() : "";
    if (!justification) {
      return yield* Effect.fail(
        new OutboundPolicyError({ reason: "documentedJustificationId_required" })
      );
    }

    if (!isStringArray(obj.hostsAllowlist)) {
      return yield* Effect.fail(new OutboundPolicyError({ reason: "hostsAllowlist_invalid" }));
    }
    if (!isStringArray(obj.payToAllowlist)) {
      return yield* Effect.fail(new OutboundPolicyError({ reason: "payToAllowlist_invalid" }));
    }
    if (!isStringArray(obj.networksAllowlist)) {
      return yield* Effect.fail(new OutboundPolicyError({ reason: "networksAllowlist_invalid" }));
    }
    if (!isStringArray(obj.assetsAllowlist)) {
      return yield* Effect.fail(new OutboundPolicyError({ reason: "assetsAllowlist_invalid" }));
    }

    const decimalKeys = [
      "maxUsdcPerCall",
      "maxUsdcPerDay",
      "maxUsdcPerSession",
      "humanApprovalAboveUsdc",
    ] as const;
    for (const key of decimalKeys) {
      if (typeof obj[key] !== "string") {
        return yield* Effect.fail(new OutboundPolicyError({ reason: `${key}_must_be_string` }));
      }
      yield* parseUsdcToAtomic(obj[key] as string);
    }

    const policy: OutboundPaymentPolicy = {
      hostsAllowlist: normalizeAllowlist(obj.hostsAllowlist),
      payToAllowlist: normalizeAllowlist(obj.payToAllowlist),
      networksAllowlist: normalizeAllowlist(obj.networksAllowlist),
      assetsAllowlist: normalizeAllowlist(obj.assetsAllowlist),
      maxUsdcPerCall: (obj.maxUsdcPerCall as string).trim(),
      maxUsdcPerDay: (obj.maxUsdcPerDay as string).trim(),
      maxUsdcPerSession: (obj.maxUsdcPerSession as string).trim(),
      humanApprovalAboveUsdc: (obj.humanApprovalAboveUsdc as string).trim(),
      requireDocumentedJustification: true,
      documentedJustificationId: justification,
    };

    if (previous) {
      if (!isSubset(policy.hostsAllowlist, previous.hostsAllowlist)) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "hostsAllowlist_widen_rejected" })
        );
      }
      if (!isSubset(policy.payToAllowlist, previous.payToAllowlist)) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "payToAllowlist_widen_rejected" })
        );
      }
      if (!isSubset(policy.networksAllowlist, previous.networksAllowlist)) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "networksAllowlist_widen_rejected" })
        );
      }
      if (!isSubset(policy.assetsAllowlist, previous.assetsAllowlist)) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "assetsAllowlist_widen_rejected" })
        );
      }

      const callCmp = yield* compareUsdcDecimal(policy.maxUsdcPerCall, previous.maxUsdcPerCall);
      if (callCmp > 0) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "maxUsdcPerCall_raise_rejected" })
        );
      }
      const dayCmp = yield* compareUsdcDecimal(policy.maxUsdcPerDay, previous.maxUsdcPerDay);
      if (dayCmp > 0) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "maxUsdcPerDay_raise_rejected" })
        );
      }
      const sessionCmp = yield* compareUsdcDecimal(
        policy.maxUsdcPerSession,
        previous.maxUsdcPerSession
      );
      if (sessionCmp > 0) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "maxUsdcPerSession_raise_rejected" })
        );
      }
      // Raising HITL threshold is more restrictive (OK). Lowering is loosening — reject.
      const hitlCmp = yield* compareUsdcDecimal(
        policy.humanApprovalAboveUsdc,
        previous.humanApprovalAboveUsdc
      );
      if (hitlCmp < 0) {
        return yield* Effect.fail(
          new OutboundPolicyError({ reason: "humanApprovalAboveUsdc_lower_rejected" })
        );
      }

      const hostsGrew =
        policy.hostsAllowlist.length > previous.hostsAllowlist.length ||
        !isSubset(previous.hostsAllowlist, policy.hostsAllowlist);
      const payToGrew =
        policy.payToAllowlist.length > previous.payToAllowlist.length ||
        !isSubset(previous.payToAllowlist, policy.payToAllowlist);
      // "Grows" relative to previous means re-adding after a shrink — detected as not equal
      // and not a pure subset shrink. Spec: re-adding requires justification (already required).
      void hostsGrew;
      void payToGrew;
    }

    return {
      versionId: policyVersionId(policy),
      policy,
      acceptedAt: new Date().toISOString(),
    } satisfies OutboundPaymentPolicyAccepted;
  });
}

/**
 * Evaluate `outbound_payment` against a loaded policy.
 * Deny-by-default when allowlists empty or checks fail. First enablement → HITL always.
 */
export function evaluateOutboundPayment(
  policy: OutboundPaymentPolicy,
  action: OutboundPaymentAction
): Effect.Effect<OutboundSpendDecision, OutboundPolicyError> {
  return Effect.gen(function* () {
    if (action.kind !== "outbound_payment") {
      return { decision: "deny" as const, reason: "action_kind_mismatch" };
    }

    const host = hostFromResourceUrl(action.resourceUrl);
    if (!host) {
      return { decision: "deny" as const, reason: "invalid_resource_url" };
    }
    if (!hostMatchesAllowlist(host, policy.hostsAllowlist)) {
      return { decision: "deny" as const, reason: "host_not_allowlisted" };
    }

    const payToNorm = action.quote.payTo.trim().toLowerCase();
    const payToOk = policy.payToAllowlist.some((p) => p.trim().toLowerCase() === payToNorm);
    if (!payToOk) {
      return { decision: "deny" as const, reason: "payTo_not_allowlisted" };
    }

    const networkOk = policy.networksAllowlist.some(
      (n) => n.trim().toLowerCase() === action.quote.network.trim().toLowerCase()
    );
    if (!networkOk) {
      return { decision: "deny" as const, reason: "network_not_allowlisted" };
    }

    const assetOk = policy.assetsAllowlist.some(
      (a) => a.trim().toLowerCase() === action.quote.asset.trim().toLowerCase()
    );
    if (!assetOk) {
      return { decision: "deny" as const, reason: "asset_not_allowlisted" };
    }

    const amount = action.quote.amountUsdc;
    if ((yield* compareUsdcDecimal(amount, policy.maxUsdcPerCall)) > 0) {
      return { decision: "deny" as const, reason: "max_usdc_per_call_exceeded" };
    }

    const projectedDay = yield* addUsdcDecimal(action.dayTotalUsdc, amount);
    if ((yield* compareUsdcDecimal(projectedDay, policy.maxUsdcPerDay)) > 0) {
      return { decision: "deny" as const, reason: "max_usdc_per_day_exceeded" };
    }

    const projectedSession = yield* addUsdcDecimal(action.sessionTotalUsdc, amount);
    if ((yield* compareUsdcDecimal(projectedSession, policy.maxUsdcPerSession)) > 0) {
      return { decision: "deny" as const, reason: "max_usdc_per_session_exceeded" };
    }

    // First enablement: HITL regardless of amount — no override.
    if (!action.outboundPaymentEverEnabled) {
      if (!action.hitlApproval || action.hitlApproval.quoteDigest !== action.quote.digest) {
        return {
          decision: "hitl" as const,
          reason: "first_outbound_enablement_requires_hitl",
        };
      }
      return { decision: "allow" as const, reason: "first_enablement_hitl_bound" };
    }

    const needsHitl = (yield* compareUsdcDecimal(amount, policy.humanApprovalAboveUsdc)) >= 0;
    if (needsHitl) {
      if (!action.hitlApproval) {
        return { decision: "hitl" as const, reason: "amount_requires_hitl" };
      }
      if (action.hitlApproval.quoteDigest !== action.quote.digest) {
        return { decision: "deny" as const, reason: "hitl_quote_digest_mismatch" };
      }
    }

    return { decision: "allow" as const };
  });
}

/** Effect service wrapping policy load + evaluate for DI. */
export class OutboundPaymentPolicyService extends Context.Tag(
  "clawql/OutboundPaymentPolicyService"
)<
  OutboundPaymentPolicyService,
  {
    readonly load: (
      raw: unknown,
      previous?: OutboundPaymentPolicy | null
    ) => Effect.Effect<OutboundPaymentPolicyAccepted, OutboundPolicyError | ConfigError>;
    readonly evaluate: (
      policy: OutboundPaymentPolicy,
      action: OutboundPaymentAction
    ) => Effect.Effect<OutboundSpendDecision, OutboundPolicyError>;
  }
>() {}

export const OutboundPaymentPolicyServiceLive = Layer.succeed(
  OutboundPaymentPolicyService,
  OutboundPaymentPolicyService.of({
    load: loadOutboundPaymentPolicy,
    evaluate: evaluateOutboundPayment,
  })
);
