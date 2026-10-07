/**
 * Production approval-policy evaluator (mandate / N-of-M / self-approve / deny classes).
 * Differential tests compare this against the Lean oracle in formal/lean/ and
 * packages/clawql-api/src/policy/approval-policy-oracle.ts.
 */

import { Effect } from "effect";

export type ApprovalActionClass = "read" | "write" | "delete" | "payment";

export type ApprovalPolicy = {
  readonly requiredApprovals: number;
  /** When true, delete/payment actions are never allowed. */
  readonly denyDestructive: boolean;
};

export type ApprovalRequest = {
  readonly requesterId: string;
  readonly action: ApprovalActionClass;
  readonly approverIds: readonly string[];
};

export type ApprovalDecision = "allow" | "deny";

export type ApprovalDenyReason =
  | "self_approval"
  | "destructive_denied"
  | "insufficient_approvals"
  | "duplicate_approver";

export type ApprovalEvalResult = {
  readonly decision: ApprovalDecision;
  readonly reason?: ApprovalDenyReason;
};

/**
 * Evaluate whether a request may proceed under the active policy.
 * Invariants (target): no self-approval; deletes/payments denied when
 * denyDestructive; N approvals require N distinct people (none = requester).
 */
export function evaluateApprovalPolicyEffect(
  policy: ApprovalPolicy,
  request: ApprovalRequest
): Effect.Effect<ApprovalEvalResult> {
  return Effect.sync(() => evaluateApprovalPolicy(policy, request));
}

export function evaluateApprovalPolicy(
  policy: ApprovalPolicy,
  request: ApprovalRequest
): ApprovalEvalResult {
  const requester = request.requesterId.trim();
  const approvers = request.approverIds.map((a) => a.trim()).filter(Boolean);

  if (policy.denyDestructive && (request.action === "delete" || request.action === "payment")) {
    return { decision: "deny", reason: "destructive_denied" };
  }

  if (approvers.some((a) => a === requester)) {
    return { decision: "deny", reason: "self_approval" };
  }

  const distinct = new Set(approvers);
  if (distinct.size !== approvers.length) {
    return { decision: "deny", reason: "duplicate_approver" };
  }

  const need = Math.max(0, Math.floor(policy.requiredApprovals));
  if (distinct.size < need) {
    return { decision: "deny", reason: "insufficient_approvals" };
  }

  return { decision: "allow" };
}
