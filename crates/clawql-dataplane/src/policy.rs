//! Policy evaluator — Phase C Verus target (Lean: `formal/lean/ApprovalPolicy.lean`).
//!
//! Phase A ships a plain Rust port for differential prep; Verus annotations come later.

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

    #[test]
    fn denies_self_approval() {
        let d = evaluate_approval(
            &Policy {
                required_approvals: 1,
                deny_destructive: false,
            },
            &Request {
                requester_id: "alice".into(),
                action: ActionClass::Write,
                approver_ids: vec!["alice".into()],
            },
        );
        assert_eq!(d, Decision::Deny(DenyReason::SelfApproval));
    }

    #[test]
    fn allows_distinct_approver() {
        let d = evaluate_approval(
            &Policy {
                required_approvals: 1,
                deny_destructive: true,
            },
            &Request {
                requester_id: "alice".into(),
                action: ActionClass::Write,
                approver_ids: vec!["bob".into()],
            },
        );
        assert_eq!(d, Decision::Allow);
    }
}
