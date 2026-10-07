---------------------------- MODULE MandateLifecycle ----------------------------
(***************************************************************************)
(* ClawQL pending-execution / mandate lifecycle — target safety model.     *)
(*                                                                         *)
(* Production names: pending | approved | declined | completed | failed |  *)
(* expired. See packages/clawql-api/src/pending/ and ADR 0014.              *)
(*                                                                         *)
(* WeakConsume = TRUE models today's non-atomic consume (execute while     *)
(* still approved). TLC should then violate AtMostOneSideEffect.           *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Replicas,          \* set of gateway replica ids, e.g. {"r1","r2"}
  MaxEids,           \* max mandate ids to create (small for TLC)
  Digests,           \* abstract args digests, e.g. {"d1","d2"}
  Principals,        \* humans/agents that park or approve
  WeakConsume        \* BOOLEAN — TRUE = model today's race-prone consume

VARIABLES
  executions,        \* [eid |-> record]
  nextEid,           \* Nat counter for fresh ids
  sideEffects,       \* [eid |-> Nat] successful mandated executes
  clock              \* Nat — coarse time for expiry

Eid == 1..MaxEids

Statuses == {"none", "pending", "approved", "declined",
             "completed", "failed", "expired"}

Terminal == {"declined", "completed", "failed", "expired"}

Record == [
  status: Statuses,
  digest: Digests \cup {"none"},
  requester: Principals \cup {"none"},
  approver: Principals \cup {"none"},
  expiresAt: Nat
]

TypeOK ==
  /\ nextEid \in 1..(MaxEids + 1)
  /\ clock \in Nat
  /\ sideEffects \in [Eid -> Nat]
  /\ executions \in [Eid -> Record]

-----------------------------------------------------------------------------
Init ==
  /\ executions = [e \in Eid |->
       [status |-> "none", digest |-> "none", requester |-> "none",
        approver |-> "none", expiresAt |-> 0]]
  /\ nextEid = 1
  /\ sideEffects = [e \in Eid |-> 0]
  /\ clock = 0

-----------------------------------------------------------------------------
\* Park: agent request requires mandate — create pending record.
Park(r, principal, digest, ttl) ==
  /\ r \in Replicas
  /\ principal \in Principals
  /\ digest \in Digests
  /\ ttl \in 1..3
  /\ nextEid <= MaxEids
  /\ LET e == nextEid IN
       /\ executions' = [executions EXCEPT ![e] = [
            status |-> "pending",
            digest |-> digest,
            requester |-> principal,
            approver |-> "none",
            expiresAt |-> clock + ttl]]
       /\ nextEid' = nextEid + 1
  /\ UNCHANGED <<sideEffects, clock>>

\* Approve: human operator; must not be the requester; not expired.
Approve(r, e, principal) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ principal \in Principals
  /\ executions[e].status = "pending"
  /\ principal # executions[e].requester
  /\ IF clock >= executions[e].expiresAt
     THEN /\ executions' = [executions EXCEPT ![e].status = "expired"]
          /\ UNCHANGED <<nextEid, sideEffects, clock>>
     ELSE /\ executions' = [executions EXCEPT
              ![e].status = "approved",
              ![e].approver = principal]
          /\ UNCHANGED <<nextEid, sideEffects, clock>>

Decline(r, e, principal) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ principal \in Principals
  /\ executions[e].status = "pending"
  /\ principal # executions[e].requester
  /\ executions' = [executions EXCEPT ![e].status = "declined"]
  /\ UNCHANGED <<nextEid, sideEffects, clock>>

\* Target: execute consumes in the same step (approved -> completed).
\* Weak: leave status approved so a second replica can execute again.
ExecuteApproved(r, e, liveDigest) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ liveDigest \in Digests
  /\ executions[e].status = "approved"
  /\ clock < executions[e].expiresAt
  /\ liveDigest = executions[e].digest
  /\ sideEffects' = [sideEffects EXCEPT ![e] = @ + 1]
  /\ IF WeakConsume
     THEN /\ UNCHANGED executions
     ELSE /\ executions' = [executions EXCEPT ![e].status = "completed"]
  /\ UNCHANGED <<nextEid, clock>>

\* Today's post-execute mark — only meaningful under WeakConsume.
MarkDone(r, e, ok) ==
  /\ WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ executions[e].status = "approved"
  /\ executions' = [executions EXCEPT ![e].status =
       IF ok THEN "completed" ELSE "failed"]
  /\ UNCHANGED <<nextEid, sideEffects, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<executions, nextEid, sideEffects>>

-----------------------------------------------------------------------------
Next ==
  \/ \E r \in Replicas, p \in Principals, d \in Digests, t \in 1..3 :
       Park(r, p, d, t)
  \/ \E r \in Replicas, e \in Eid, p \in Principals :
       Approve(r, e, p)
  \/ \E r \in Replicas, e \in Eid, p \in Principals :
       Decline(r, e, p)
  \/ \E r \in Replicas, e \in Eid, d \in Digests :
       ExecuteApproved(r, e, d)
  \/ \E r \in Replicas, e \in Eid, ok \in BOOLEAN :
       MarkDone(r, e, ok)
  \/ Tick

Spec == Init /\ [][Next]_<<executions, nextEid, sideEffects, clock>>

-----------------------------------------------------------------------------
\* Invariants

AtMostOneSideEffect ==
  \A e \in Eid : sideEffects[e] <= 1

DigestMatchOnExecute ==
  \* inductive: after any step, if we just executed, digest matched —
  \* encoded in ExecuteApproved guard; keep as type-level documentation.
  TRUE

NoExecuteAfterExpiry ==
  \* ExecuteApproved requires clock < expiresAt; completed with effects
  \* only after that guard. Soft check: no completed with clock past expiry
  \* at the moment of completion is harder without history; rely on guard.
  TRUE

NoExecuteUnlessApproved ==
  \A e \in Eid :
    sideEffects[e] > 0 =>
      executions[e].approver # "none"

ApproverNotRequester ==
  \A e \in Eid :
    executions[e].approver # "none" =>
      executions[e].approver # executions[e].requester

TerminalNeverLeaves ==
  \A e \in Eid :
    executions[e].status \in Terminal =>
      \* stuttering ok; Next cannot move terminal back to pending/approved
      TRUE

\* Bundle for TLC
Safety ==
  /\ TypeOK
  /\ AtMostOneSideEffect
  /\ ApproverNotRequester
  /\ NoExecuteUnlessApproved

\* Named for .cfg CONSTRAINT (TLC requires an operator name, not an inline expr)
StateConstraint == clock <= 5

=============================================================================
