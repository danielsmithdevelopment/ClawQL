/-
  ClawQL approval-policy kernel (Lean oracle).

  Scope: request + approvers + active policy → decision.
  Invariants encoded in `evaluateApproval`:
  - no self-approval
  - deletes/payments denied when `denyDestructive`
  - N approvals require N distinct people

  Differential tests (production vs TS mirror of this function):
    packages/clawql-api/src/policy/approval-policy.differential.test.ts

  CI: `scripts/formal/check-lean-no-sorry.sh` fails on `sorry` / `admit`.
  Full `lake build` + `#print axioms` land when the lakefile is added.
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

/-- Executable oracle. Keep in lockstep with approval-policy-oracle.ts. -/
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

/-- Spec statement kept as a definitional property for docs / future proofs. -/
def noSelfApprovalOnAllow (policy : Policy) (request : Request) : Prop :=
  evaluateApproval policy request = .allow →
    ¬ (request.approverIds.map String.trim |>.filter (· ≠ "") |>.any
        (· == request.requesterId.trim))

end ClawQL.ApprovalPolicy

