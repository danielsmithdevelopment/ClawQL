---------------------------- MODULE MandateLifecycle ----------------------------
(***************************************************************************)
(* ClawQL pending-execution / mandate lifecycle — target safety model.     *)
(*                                                                         *)
(* Statuses: none | pending | approved | outcome_unknown | declined |      *)
(* completed | failed | expired                                            *)
(*                                                                         *)
(* Atomic path: Approve → Consume (→ outcome_unknown) → SideEffect →       *)
(* Finalize. CrashAfterConsume leaves outcome_unknown (not retried).       *)
(*                                                                         *)
(* WeakConsume = TRUE models the pre-fix race (side effect while still   *)
(* approved). TLC should then violate AtMostOneSideEffect.                 *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Replicas,          \* set of gateway replica ids
  MaxEids,           \* max mandate ids to create
  Digests,           \* abstract args digests
  Principals,        \* humans/agents that park or approve
  Quorum,            \* N-of-M: distinct approvers required (1 = single)
  WeakConsume        \* BOOLEAN — TRUE = legacy non-atomic consume

VARIABLES
  executions,        \* [eid |-> record]
  nextEid,
  sideEffects,       \* [eid |-> Nat] successful mandated executes
  clock,
  approvals          \* [eid |-> SUBSET Principals] distinct approvers recorded

Eid == 1..MaxEids

Statuses == {"none", "pending", "approved", "outcome_unknown",
             "declined", "completed", "failed", "expired"}

Terminal == {"declined", "completed", "failed", "expired"}

Record == [
  status: Statuses,
  digest: Digests \cup {"none"},
  requester: Principals \cup {"none"},
  expiresAt: Nat
]

TypeOK ==
  /\ nextEid \in 1..(MaxEids + 1)
  /\ clock \in Nat
  /\ sideEffects \in [Eid -> Nat]
  /\ executions \in [Eid -> Record]
  /\ approvals \in [Eid -> SUBSET Principals]

-----------------------------------------------------------------------------
Init ==
  /\ executions = [e \in Eid |->
       [status |-> "none", digest |-> "none", requester |-> "none",
        expiresAt |-> 0]]
  /\ nextEid = 1
  /\ sideEffects = [e \in Eid |-> 0]
  /\ clock = 0
  /\ approvals = [e \in Eid |-> {}]

-----------------------------------------------------------------------------
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
            expiresAt |-> clock + ttl]]
       /\ nextEid' = nextEid + 1
       /\ approvals' = [approvals EXCEPT ![e] = {}]
  /\ UNCHANGED <<sideEffects, clock>>

\* Args change while approval in flight — only allowed in pending; digest updates.
\* Proves execute still requires liveDigest = parked digest at consume time.
TamperPendingDigest(r, e, newDigest) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ newDigest \in Digests
  /\ executions[e].status = "pending"
  /\ newDigest # executions[e].digest
  /\ executions' = [executions EXCEPT ![e].digest = newDigest]
  /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>

\* N-of-M approve: each principal at most once; never the requester.
\* At expiry boundary: clock >= expiresAt → expire instead of counting approval.
Approve(r, e, principal) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ principal \in Principals
  /\ executions[e].status = "pending"
  /\ principal # executions[e].requester
  /\ principal \notin approvals[e]
  /\ IF clock >= executions[e].expiresAt
     THEN /\ executions' = [executions EXCEPT ![e].status = "expired"]
          /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>
     ELSE /\ LET nextApp == approvals[e] \cup {principal} IN
               /\ approvals' = [approvals EXCEPT ![e] = nextApp]
               /\ IF Cardinality(nextApp) >= Quorum
                  THEN executions' = [executions EXCEPT ![e].status = "approved"]
                  ELSE UNCHANGED executions
          /\ UNCHANGED <<nextEid, sideEffects, clock>>

Decline(r, e, principal) ==
  /\ r \in Replicas
  /\ e \in Eid
  /\ principal \in Principals
  /\ executions[e].status = "pending"
  /\ principal # executions[e].requester
  /\ executions' = [executions EXCEPT ![e].status = "declined"]
  /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>

\* Atomic consume: approved → outcome_unknown in one step (target).
Consume(r, e, liveDigest) ==
  /\ ~WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ liveDigest \in Digests
  /\ executions[e].status = "approved"
  /\ clock < executions[e].expiresAt
  /\ liveDigest = executions[e].digest
  /\ executions' = [executions EXCEPT ![e].status = "outcome_unknown"]
  /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>

\* Side effect only from outcome_unknown (after consume).
SideEffect(r, e) ==
  /\ ~WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ executions[e].status = "outcome_unknown"
  /\ sideEffects[e] = 0
  /\ sideEffects' = [sideEffects EXCEPT ![e] = @ + 1]
  /\ UNCHANGED <<executions, nextEid, clock, approvals>>

\* Crash after consume is modeled by *not* taking SideEffect/Finalize:
\* status stays outcome_unknown (surfaced in Review / WORM). No silent retry.

Finalize(r, e, ok) ==
  /\ ~WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ executions[e].status = "outcome_unknown"
  /\ executions' = [executions EXCEPT ![e].status =
       IF ok THEN "completed" ELSE "failed"]
  /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>

\* Legacy weak path: execute while still approved (pre-fix).
WeakExecute(r, e, liveDigest) ==
  /\ WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ liveDigest \in Digests
  /\ executions[e].status = "approved"
  /\ clock < executions[e].expiresAt
  /\ liveDigest = executions[e].digest
  /\ sideEffects' = [sideEffects EXCEPT ![e] = @ + 1]
  /\ UNCHANGED <<executions, nextEid, clock, approvals>>

MarkDoneWeak(r, e, ok) ==
  /\ WeakConsume
  /\ r \in Replicas
  /\ e \in Eid
  /\ executions[e].status = "approved"
  /\ executions' = [executions EXCEPT ![e].status =
       IF ok THEN "completed" ELSE "failed"]
  /\ UNCHANGED <<nextEid, sideEffects, clock, approvals>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<executions, nextEid, sideEffects, approvals>>

-----------------------------------------------------------------------------
Next ==
  \/ \E r \in Replicas, p \in Principals, d \in Digests, t \in 1..3 :
       Park(r, p, d, t)
  \/ \E r \in Replicas, e \in Eid, d \in Digests :
       TamperPendingDigest(r, e, d)
  \/ \E r \in Replicas, e \in Eid, p \in Principals :
       Approve(r, e, p)
  \/ \E r \in Replicas, e \in Eid, p \in Principals :
       Decline(r, e, p)
  \/ \E r \in Replicas, e \in Eid, d \in Digests :
       Consume(r, e, d)
  \/ \E r \in Replicas, e \in Eid :
       SideEffect(r, e)
  \/ \E r \in Replicas, e \in Eid, ok \in BOOLEAN :
       Finalize(r, e, ok)
  \/ \E r \in Replicas, e \in Eid, d \in Digests :
       WeakExecute(r, e, d)
  \/ \E r \in Replicas, e \in Eid, ok \in BOOLEAN :
       MarkDoneWeak(r, e, ok)
  \/ Tick

vars == <<executions, nextEid, sideEffects, clock, approvals>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
AtMostOneSideEffect ==
  \A e \in Eid : sideEffects[e] <= 1

\* Side effect implies prior consume (approvals non-empty) and digest was bound.
NoExecuteUnlessApproved ==
  \A e \in Eid :
    sideEffects[e] > 0 => approvals[e] # {}

ApproverNotRequester ==
  \A e \in Eid :
    \A p \in approvals[e] : p # executions[e].requester

NoDoubleCountApprover ==
  \A e \in Eid :
    \* approvals is a set — cardinality = distinct people
    TRUE

\* Outcome-unknown without side effect is allowed (crash); never more than one effect.
OutcomeUnknownHonest ==
  \A e \in Eid :
    executions[e].status = "outcome_unknown" =>
      sideEffects[e] <= 1

Safety ==
  /\ TypeOK
  /\ AtMostOneSideEffect
  /\ ApproverNotRequester
  /\ NoExecuteUnlessApproved
  /\ OutcomeUnknownHonest

StateConstraint == clock <= 5

=============================================================================
