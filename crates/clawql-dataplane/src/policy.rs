//! Policy evaluator — Phase C Verus target (Lean: `formal/lean/ApprovalPolicy.lean`).
//!
//! String-identity exec adapter (trim / drop empty). The **proved** kernel uses
//! abstract `u64` ids in [`formal/verus/approval-policy`](../../../formal/verus/approval-policy/).
//! Keep decisions lockstep with Lean `evaluateApproval` and TS `evaluateApprovalPolicy`.

#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionClass {
    Read,
    Write,
    Delete,
    Payment,
}

#[derive(Debug, Clone)]
pub struct Policy {
    pub required_approvals: usize,
    pub deny_destructive: bool,
}

#[derive(Debug, Clone)]
pub struct Request {
    pub requester_id: String,
    pub action: ActionClass,
    pub approver_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DenyReason {
    SelfApproval,
    DestructiveDenied,
    InsufficientApprovals,
    DuplicateApprover,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Deny(DenyReason),
}

fn has_duplicate(ids: &[String]) -> bool {
    for (i, x) in ids.iter().enumerate() {
        if ids[i + 1..].iter().any(|y| y == x) {
            return true;
        }
    }
    false
}

/// Executable oracle — keep lockstep with Lean `evaluateApproval`.
pub fn evaluate_approval(policy: &Policy, request: &Request) -> Decision {
    let requester = request.requester_id.trim();
    let approvers: Vec<String> = request
        .approver_ids
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    if policy.deny_destructive
        && matches!(request.action, ActionClass::Delete | ActionClass::Payment)
    {
        return Decision::Deny(DenyReason::DestructiveDenied);
    }
    if approvers.iter().any(|a| a == requester) {
        return Decision::Deny(DenyReason::SelfApproval);
    }
    if has_duplicate(&approvers) {
        return Decision::Deny(DenyReason::DuplicateApprover);
    }
    if approvers.len() < policy.required_approvals {
        return Decision::Deny(DenyReason::InsufficientApprovals);
    }
    Decision::Allow
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pol(n: usize, deny: bool) -> Policy {
        Policy {
            required_approvals: n,
            deny_destructive: deny,
        }
    }

    fn req(requester: &str, action: ActionClass, approvers: &[&str]) -> Request {
        Request {
            requester_id: requester.into(),
            action,
            approver_ids: approvers.iter().map(|s| (*s).into()).collect(),
        }
    }

    #[test]
    fn denies_self_approval() {
        assert_eq!(
            evaluate_approval(&pol(1, false), &req("alice", ActionClass::Write, &["alice"])),
            Decision::Deny(DenyReason::SelfApproval)
        );
    }

    #[test]
    fn allows_distinct_approver() {
        assert_eq!(
            evaluate_approval(&pol(1, true), &req("alice", ActionClass::Write, &["bob"])),
            Decision::Allow
        );
    }

    #[test]
    fn denies_destructive_when_configured() {
        assert_eq!(
            evaluate_approval(&pol(1, true), &req("alice", ActionClass::Delete, &["bob"])),
            Decision::Deny(DenyReason::DestructiveDenied)
        );
        assert_eq!(
            evaluate_approval(&pol(1, true), &req("alice", ActionClass::Payment, &["bob"])),
            Decision::Deny(DenyReason::DestructiveDenied)
        );
    }

    #[test]
    fn denies_duplicate_approver() {
        assert_eq!(
            evaluate_approval(
                &pol(2, false),
                &req("alice", ActionClass::Write, &["bob", "bob"])
            ),
            Decision::Deny(DenyReason::DuplicateApprover)
        );
    }

    #[test]
    fn denies_insufficient_approvals() {
        assert_eq!(
            evaluate_approval(&pol(2, false), &req("alice", ActionClass::Write, &["bob"])),
            Decision::Deny(DenyReason::InsufficientApprovals)
        );
    }

    #[test]
    fn trims_and_drops_empty_approvers() {
        assert_eq!(
            evaluate_approval(
                &pol(1, false),
                &req(" alice ", ActionClass::Write, &["  bob  ", "", "   "])
            ),
            Decision::Allow
        );
    }

    #[test]
    fn n_of_m_two_distinct() {
        assert_eq!(
            evaluate_approval(
                &pol(2, false),
                &req("alice", ActionClass::Write, &["bob", "carol"])
            ),
            Decision::Allow
        );
    }
}
