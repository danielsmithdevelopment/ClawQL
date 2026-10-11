---------------------------- MODULE BatchMandate ----------------------------
(***************************************************************************)
(* ClawQL batch Merkle mandate — one key-touch over a root of digests.     *)
(*                                                                         *)
(* Extends the single-mandate at-most-once story (MandateLifecycle) with:  *)
(*   BatchPark → RootApprove → InclusionConsume → SideEffect → Finalize    *)
(*   DeclineOne drops a leaf (and dependents are host-policy, not modeled) *)
(*                                                                         *)
(* Batches are NOT atomic across outside systems — partial outcomes are    *)
(* allowed. Safety: at most one side effect per digest; consume only when  *)
(* the leaf is under the signed root.                                      *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Digests,           \* set of abstract args digests
  MaxBatches,        \* max batch ids
  Principals,
  Quorum

VARIABLES
  batches,           \* [bid |-> record]
  nextBid,
  sideEffects,       \* [digest |-> Nat]
  approvals,         \* [bid |-> SUBSET Principals]
  declined           \* [bid |-> SUBSET Digests]

Bid == 1..MaxBatches

Statuses == {"none", "pending", "root_approved", "closed"}

\* Digests in a batch are a non-empty subset; root is abstract (paired with set).
Record == [
  status: Statuses,
  digests: SUBSET Digests,
  rootSigned: BOOLEAN,
  requester: Principals \cup {"none"}
]

TypeOK ==
  /\ nextBid \in 1..(MaxBatches + 1)
  /\ sideEffects \in [Digests -> Nat]
  /\ batches \in [Bid -> Record]
  /\ approvals \in [Bid -> SUBSET Principals]
  /\ declined \in [Bid -> SUBSET Digests]

-----------------------------------------------------------------------------
Init ==
  /\ batches = [b \in Bid |->
       [status |-> "none", digests |-> {}, rootSigned |-> FALSE,
        requester |-> "none"]]
  /\ nextBid = 1
  /\ sideEffects = [d \in Digests |-> 0]
  /\ approvals = [b \in Bid |-> {}]
  /\ declined = [b \in Bid |-> {}]

-----------------------------------------------------------------------------
BatchPark(principal, ds) ==
  /\ principal \in Principals
  /\ ds \in SUBSET Digests
  /\ ds # {}
  /\ nextBid <= MaxBatches
  /\ LET b == nextBid IN
       /\ batches' = [batches EXCEPT ![b] = [
            status |-> "pending",
            digests |-> ds,
            rootSigned |-> FALSE,
            requester |-> principal]]
       /\ nextBid' = nextBid + 1
       /\ approvals' = [approvals EXCEPT ![b] = {}]
       /\ declined' = [declined EXCEPT ![b] = {}]
  /\ UNCHANGED sideEffects

RootApprove(b, principal) ==
  /\ b \in Bid
  /\ principal \in Principals
  /\ batches[b].status = "pending"
  /\ principal # batches[b].requester
  /\ approvals' = [approvals EXCEPT ![b] = @ \cup {principal}]
  /\ IF Cardinality(approvals'[b]) >= Quorum
     THEN batches' = [batches EXCEPT ![b] = [
            status |-> "root_approved",
            digests |-> @.digests,
            rootSigned |-> TRUE,
            requester |-> @.requester]]
     ELSE UNCHANGED batches
  /\ UNCHANGED <<nextBid, sideEffects, declined>>

DeclineOne(b, principal, d) ==
  /\ b \in Bid
  /\ principal \in Principals
  /\ d \in Digests
  /\ batches[b].status \in {"pending", "root_approved"}
  /\ d \in batches[b].digests
  /\ d \notin declined[b]
  /\ sideEffects[d] = 0          \* cannot decline a leaf that already ran
  /\ declined' = [declined EXCEPT ![b] = @ \cup {d}]
  /\ UNCHANGED <<batches, nextBid, sideEffects, approvals>>

\* Consume one leaf under a signed root; digest must be in the batch and not declined.
InclusionConsume(b, d) ==
  /\ b \in Bid
  /\ d \in Digests
  /\ batches[b].status = "root_approved"
  /\ batches[b].rootSigned = TRUE
  /\ d \in batches[b].digests
  /\ d \notin declined[b]
  /\ sideEffects[d] = 0
  /\ sideEffects' = [sideEffects EXCEPT ![d] = 1]
  /\ UNCHANGED <<batches, nextBid, approvals, declined>>

CloseBatch(b) ==
  /\ b \in Bid
  /\ batches[b].status = "root_approved"
  /\ \A d \in batches[b].digests :
       (d \in declined[b]) \/ (sideEffects[d] = 1)
  /\ batches' = [batches EXCEPT ![b] = [
       status |-> "closed",
       digests |-> @.digests,
       rootSigned |-> @.rootSigned,
       requester |-> @.requester]]
  /\ UNCHANGED <<nextBid, sideEffects, approvals, declined>>

-----------------------------------------------------------------------------
Next ==
  \/ \E p \in Principals, ds \in SUBSET Digests : BatchPark(p, ds)
  \/ \E b \in Bid, p \in Principals : RootApprove(b, p)
  \/ \E b \in Bid, p \in Principals, d \in Digests : DeclineOne(b, p, d)
  \/ \E b \in Bid, d \in Digests : InclusionConsume(b, d)
  \/ \E b \in Bid : CloseBatch(b)

vars == <<batches, nextBid, sideEffects, approvals, declined>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
AtMostOneSideEffectPerDigest ==
  \A d \in Digests : sideEffects[d] <= 1

\* Side effect only for digests that were in some root-approved batch and not declined.
NoEffectUnlessIncluded ==
  \A d \in Digests :
    sideEffects[d] > 0 =>
      \E b \in Bid :
        /\ batches[b].rootSigned = TRUE
        /\ d \in batches[b].digests
        /\ d \notin declined[b]

ApproverNotRequester ==
  \A b \in Bid :
    \A p \in approvals[b] : p # batches[b].requester

Safety ==
  /\ TypeOK
  /\ AtMostOneSideEffectPerDigest
  /\ NoEffectUnlessIncluded
  /\ ApproverNotRequester

=============================================================================
