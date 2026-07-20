/**
 * MEDIUM kinetic mandate gate (essay gap 3.4).
 * Reject when mandate is required and not presented; allow when mandate matches.
 */

import type { KineticAtrClaims } from "./atr-check.js";

export type KineticMandate = {
  /** Mandate type, e.g. AP2_FINANCIAL */
  type: string;
  /** Opaque mandate / approval id */
  id: string;
};

export type MandatePolicy = {
  /** Action or field requires a mandate unconditionally. */
  requiresMandate?: boolean;
  /** Expected mandate type when required. */
  mandateType?: string;
  /** Absolute change limit (money); exceeding requires a mandate even if requiresMandate is false. */
  changeLimit?: number;
  /** Absolute delta of the proposed change (e.g. |newAmount - oldAmount|). */
  changeAmount?: number;
};

export type MandateDecision = {
  allowed: boolean;
  reason: string;
  mandateRequired: boolean;
};

function parseLimit(raw: string | number | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function resolveChangeLimit(
  raw: string | number | undefined
): number | undefined {
  return parseLimit(raw);
}

/**
 * Mandate is required when policy says so, or when |change| exceeds change_limit.
 */
export function mandateIsRequired(policy: MandatePolicy): boolean {
  if (policy.requiresMandate) return true;
  if (
    policy.changeLimit != null &&
    policy.changeAmount != null &&
    Math.abs(policy.changeAmount) > policy.changeLimit
  ) {
    return true;
  }
  return false;
}

function claimsHaveMandate(
  claims: KineticAtrClaims | null | undefined,
  mandateType: string | undefined
): boolean {
  if (!claims) return false;
  const scope = claims.scope ?? [];
  if (scope.includes("*") || scope.includes("ontology:mandate")) return true;
  if (mandateType) {
    if (scope.includes(`mandate:${mandateType}`) || scope.includes(mandateType)) return true;
  }
  const listed = claims.mandates ?? [];
  if (mandateType && listed.includes(mandateType)) return true;
  if (!mandateType && listed.length > 0) return true;
  return false;
}

/**
 * After ATR allows: ensure mandate is present when policy requires it.
 */
export function checkKineticMandate(args: {
  policy: MandatePolicy;
  mandate?: KineticMandate | null;
  claims?: KineticAtrClaims | null;
}): MandateDecision {
  const required = mandateIsRequired(args.policy);
  if (!required) {
    return { allowed: true, reason: "mandate_not_required", mandateRequired: false };
  }

  const expected = args.policy.mandateType?.trim();
  const presented = args.mandate;
  if (presented?.id?.trim()) {
    if (expected && presented.type && presented.type !== expected) {
      return {
        allowed: false,
        reason: `mandate_type_mismatch:expected_${expected}`,
        mandateRequired: true,
      };
    }
    return { allowed: true, reason: "mandate_presented", mandateRequired: true };
  }

  if (claimsHaveMandate(args.claims, expected)) {
    return { allowed: true, reason: "mandate_in_atr_scope", mandateRequired: true };
  }

  return {
    allowed: false,
    reason: expected ? `mandate_required:${expected}` : "mandate_required",
    mandateRequired: true,
  };
}
