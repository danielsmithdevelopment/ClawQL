/**
 * TypeScript mirror of formal/lean/ApprovalPolicy.lean — the differential-test oracle.
 * Keep semantics in lockstep with the Lean model; proofs live in Lean, not here.
 */

import type { ApprovalEvalResult, ApprovalPolicy, ApprovalRequest } from "./approval-policy.js";

/** Pure oracle — same rules as `evaluateApproval` in ApprovalPolicy.lean. */
export function leanOracleEvaluateApproval(
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
