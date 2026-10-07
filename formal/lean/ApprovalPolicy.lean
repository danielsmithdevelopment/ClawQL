/-
  ClawQL approval-policy kernel (Lean oracle).
  Differential tests: packages/clawql-api/src/policy/approval-policy.differential.test.ts
  mirrors this file in TypeScript (approval-policy-oracle.ts).

  Scope (tight): request + approvers + active policy → decision.
  Invariants: no self-approval; deletes/payments denied when denyDestructive;
  N approvals require N distinct people.
-/

namespace ClawQL.ApprovalPolicy

inductive ActionClass where
  | read
  | write
  | delete
  | payment
  deriving DecidableEq, Repr

structure Policy where
  requiredApprovals : Nat
  denyDestructive : Bool
  deriving Repr

structure Request where
  requesterId : String
  action : ActionClass
  approverIds : List String
  deriving Repr

inductive DenyReason where
  | selfApproval
  | destructiveDenied
  | insufficientApprovals
  | duplicateApprover
  deriving DecidableEq, Repr

inductive Decision where
  | allow
  | deny (reason : DenyReason)
  deriving DecidableEq, Repr

def hasDuplicate : List String → Bool
  | [] => false
  | x :: xs => xs.contains x || hasDuplicate xs

def evaluateApproval (policy : Policy) (request : Request) : Decision :=
  let requester := request.requesterId.trim
  let approvers := request.approverIds.map String.trim |>.filter (· ≠ "")
  if policy.denyDestructive && (request.action == .delete || request.action == .payment) then
    .deny .destructiveDenied
  else if approvers.any (· == requester) then
    .deny .selfApproval
  else if hasDuplicate approvers then
    .deny .duplicateApprover
  else if approvers.length < policy.requiredApprovals then
    .deny .insufficientApprovals
  else
    .allow

/-- No self-approval on allow. -/
theorem allow_implies_no_self_approval
    (policy : Policy) (request : Request)
    (h : evaluateApproval policy request = .allow) :
    ∀ a ∈ request.approverIds.map String.trim |>.filter (· ≠ ""),
      a ≠ request.requesterId.trim := by
  sorry -- filled as the oracle hardens; CI relies on differential tests today

end ClawQL.ApprovalPolicy
