//! Verus-proved approval policy kernel (ADR 0016 Phase C).
//!
//! Person identities are abstract `u64` values. String trim / empty-filter live in
//! TypeScript (`approval-policy.ts`) and `clawql-dataplane` `policy.rs` adapters.
//! Spec properties match Lean `formal/lean/ApprovalPolicy.lean`.
//!
//! Verify: `../../../../scripts/formal/verify-approval-policy-verus.sh`

use vstd::prelude::*;

verus! {

pub enum ActionClass {
    Read,
    Write,
    Delete,
    Payment,
}

pub struct Policy {
    pub required_approvals: u64,
    pub deny_destructive: bool,
}

pub enum DenyReason {
    SelfApproval,
    DestructiveDenied,
    InsufficientApprovals,
    DuplicateApprover,
}

pub enum Decision {
    Allow,
    Deny { reason: DenyReason },
}

pub open spec fn is_destructive(action: ActionClass) -> bool {
    match action {
        ActionClass::Delete => true,
        ActionClass::Payment => true,
        ActionClass::Read => false,
        ActionClass::Write => false,
    }
}

pub open spec fn is_allow(d: Decision) -> bool {
    match d {
        Decision::Allow => true,
        Decision::Deny { .. } => false,
    }
}

pub open spec fn is_deny(d: Decision) -> bool {
    !is_allow(d)
}

/// Spec: `ids` contains a duplicate (pairwise).
pub open spec fn has_duplicate(ids: Seq<u64>) -> bool {
    exists|i: int, j: int| 0 <= i < j < ids.len() && ids[i] == ids[j]
}

pub open spec fn contains_id(ids: Seq<u64>, id: u64) -> bool {
    exists|i: int| 0 <= i < ids.len() && ids[i] == id
}

/// Spec oracle — Lean `evaluateApproval` with identities already normalized.
pub open spec fn evaluate_approval_spec(
    required_approvals: u64,
    deny_destructive: bool,
    requester_id: u64,
    action: ActionClass,
    approver_ids: Seq<u64>,
) -> Decision {
    if deny_destructive && is_destructive(action) {
        Decision::Deny { reason: DenyReason::DestructiveDenied }
    } else if contains_id(approver_ids, requester_id) {
        Decision::Deny { reason: DenyReason::SelfApproval }
    } else if has_duplicate(approver_ids) {
        Decision::Deny { reason: DenyReason::DuplicateApprover }
    } else if approver_ids.len() < required_approvals as int {
        Decision::Deny { reason: DenyReason::InsufficientApprovals }
    } else {
        Decision::Allow
    }
}

/// Lean `noSelfApprovalOnAllow`.
pub proof fn theorem_no_self_approval_on_allow(
    required_approvals: u64,
    deny_destructive: bool,
    requester_id: u64,
    action: ActionClass,
    approver_ids: Seq<u64>,
)
    requires
        is_allow(
            evaluate_approval_spec(
                required_approvals,
                deny_destructive,
                requester_id,
                action,
                approver_ids,
            ),
        ),
    ensures
        !contains_id(approver_ids, requester_id),
{
}

pub proof fn theorem_no_duplicate_on_allow(
    required_approvals: u64,
    deny_destructive: bool,
    requester_id: u64,
    action: ActionClass,
    approver_ids: Seq<u64>,
)
    requires
        is_allow(
            evaluate_approval_spec(
                required_approvals,
                deny_destructive,
                requester_id,
                action,
                approver_ids,
            ),
        ),
    ensures
        !has_duplicate(approver_ids),
{
}

pub proof fn theorem_enough_approvals_on_allow(
    required_approvals: u64,
    deny_destructive: bool,
    requester_id: u64,
    action: ActionClass,
    approver_ids: Seq<u64>,
)
    requires
        is_allow(
            evaluate_approval_spec(
                required_approvals,
                deny_destructive,
                requester_id,
                action,
                approver_ids,
            ),
        ),
    ensures
        approver_ids.len() >= required_approvals as int,
{
}

pub proof fn theorem_destructive_denied(
    required_approvals: u64,
    requester_id: u64,
    action: ActionClass,
    approver_ids: Seq<u64>,
)
    requires
        is_destructive(action),
    ensures
        is_deny(
            evaluate_approval_spec(required_approvals, true, requester_id, action, approver_ids),
        ),
{
}

fn vec_contains(ids: &Vec<u64>, id: u64) -> (b: bool)
    ensures
        b == contains_id(ids@, id),
{
    let mut i: usize = 0;
    while i < ids.len()
        invariant
            0 <= i <= ids.len(),
            forall|k: int| 0 <= k < i as int ==> ids@[k] != id,
        decreases ids.len() - i,
    {
        if ids[i] == id {
            return true;
        }
        i = i + 1;
    }
    false
}

fn vec_has_duplicate(ids: &Vec<u64>) -> (b: bool)
    ensures
        b == has_duplicate(ids@),
{
    let mut i: usize = 0;
    while i < ids.len()
        invariant
            0 <= i <= ids.len(),
            // Every completed index differs from all later indices.
            forall|a: int, b: int|
                0 <= a < i as int && a < b < ids@.len() ==> ids@[a] != ids@[b],
        decreases ids.len() - i,
    {
        let mut j: usize = i + 1;
        while j < ids.len()
            invariant
                0 <= i < ids.len(),
                i < j <= ids.len(),
                forall|a: int, b: int|
                    0 <= a < i as int && a < b < ids@.len() ==> ids@[a] != ids@[b],
                forall|k: int|
                    (i as int) < k < (j as int) ==> ids@[k] != ids@[i as int],
            decreases ids.len() - j,
        {
            if ids[j] == ids[i] {
                proof {
                    let ghost ii = i as int;
                    let ghost jj = j as int;
                    assert(has_duplicate(ids@)) by {
                        assert(0 <= ii);
                        assert(ii < jj);
                        assert(jj < ids@.len());
                        assert(ids@[ii] == ids@[jj]);
                    };
                }
                return true;
            }
            j = j + 1;
        }
        i = i + 1;
    }
    proof {
        assert(!has_duplicate(ids@)) by {
            assert forall|a: int, b: int|
                0 <= a < b < ids@.len() implies ids@[a] != ids@[b] by {
                assert(a < i as int);
            };
        };
    }
    false
}

fn action_is_destructive(action: ActionClass) -> (b: bool)
    ensures
        b == is_destructive(action),
{
    match action {
        ActionClass::Delete => true,
        ActionClass::Payment => true,
        ActionClass::Read => false,
        ActionClass::Write => false,
    }
}

/// Executable evaluator — postcondition = Lean/spec oracle.
pub fn evaluate_approval(
    policy: &Policy,
    requester_id: u64,
    action: ActionClass,
    approver_ids: &Vec<u64>,
) -> (d: Decision)
    ensures
        d == evaluate_approval_spec(
            policy.required_approvals,
            policy.deny_destructive,
            requester_id,
            action,
            approver_ids@,
        ),
{
    if policy.deny_destructive && action_is_destructive(action) {
        return Decision::Deny { reason: DenyReason::DestructiveDenied };
    }
    if vec_contains(approver_ids, requester_id) {
        return Decision::Deny { reason: DenyReason::SelfApproval };
    }
    if vec_has_duplicate(approver_ids) {
        return Decision::Deny { reason: DenyReason::DuplicateApprover };
    }
    if (approver_ids.len() as u64) < policy.required_approvals {
        return Decision::Deny { reason: DenyReason::InsufficientApprovals };
    }
    Decision::Allow
}

} // verus!
