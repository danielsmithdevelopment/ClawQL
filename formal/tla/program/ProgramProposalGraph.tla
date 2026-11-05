------------------------- MODULE ProgramProposalGraph -------------------------
(***************************************************************************)
(* submit_program_proposals — DAG of write leaves (ADR 0015).              *)
(*                                                                         *)
(* Batches are not atomic. Each leaf ends ran | failed | dropped | pending.*)
(* Resubmit continues: settled leaves never run twice; a leaf whose        *)
(* dependency failed/dropped is dropped without execute.                   *)
(*                                                                         *)
(* Two proposals: P1 independent; P2 dependsOn P1.                         *)
(*                                                                         *)
(* WeakAllowSettledRerun = TRUE must violate NoSettledRerun.               *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakAllowSettledRerun,  \* BOOLEAN — TRUE = buggy re-execute of settled leaf
  MaxSubmits              \* small bound (e.g. 3)

VARIABLES
  state,       \* [p \in {1,2} |-> {"none","pending","ran","failed","dropped"}]
  runCount,    \* execute attempts that produce ran/failed (not drops)
  submits      \* how many submit passes (bounded)

Proposals == {1, 2}

DependsOn(p) == IF p = 2 THEN {1} ELSE {}

TypeOK ==
  /\ state \in [Proposals -> {"none", "pending", "ran", "failed", "dropped"}]
  /\ runCount \in [Proposals -> Nat]
  /\ submits \in 0..MaxSubmits

Init ==
  /\ state = [p \in Proposals |-> "none"]
  /\ runCount = [p \in Proposals |-> 0]
  /\ submits = 0

DepsReady(p) ==
  \A d \in DependsOn(p) : state[d] = "ran"

DepsDead(p) ==
  \E d \in DependsOn(p) : state[d] \in {"failed", "dropped"}

BeginSubmit ==
  /\ submits < MaxSubmits
  /\ submits' = submits + 1
  /\ UNCHANGED <<state, runCount>>

DropDependent ==
  /\ submits > 0
  /\ state[2] \in {"none", "pending"}
  /\ DepsDead(2)
  /\ state' = [state EXCEPT ![2] = "dropped"]
  /\ UNCHANGED <<runCount, submits>>

RunSuccess(p) ==
  /\ submits > 0
  /\ state[p] \in {"none", "pending"}
  /\ DepsReady(p)
  /\ ~DepsDead(p)
  /\ state' = [state EXCEPT ![p] = "ran"]
  /\ runCount' = [runCount EXCEPT ![p] = @ + 1]
  /\ UNCHANGED submits

RunFailed(p) ==
  /\ submits > 0
  /\ state[p] \in {"none", "pending"}
  /\ DepsReady(p)
  /\ ~DepsDead(p)
  /\ state' = [state EXCEPT ![p] = "failed"]
  /\ runCount' = [runCount EXCEPT ![p] = @ + 1]
  /\ UNCHANGED submits

\* First park only (none → pending); avoids stutter loops.
Park(p) ==
  /\ submits > 0
  /\ state[p] = "none"
  /\ DepsReady(p)
  /\ ~DepsDead(p)
  /\ state' = [state EXCEPT ![p] = "pending"]
  /\ UNCHANGED <<runCount, submits>>

WeakReRunSettled(p) ==
  /\ WeakAllowSettledRerun
  /\ state[p] \in {"ran", "failed"}
  /\ runCount' = [runCount EXCEPT ![p] = @ + 1]
  /\ UNCHANGED <<state, submits>>

WeakRunAfterDeadDep ==
  /\ WeakAllowSettledRerun
  /\ state[2] \in {"none", "pending"}
  /\ DepsDead(2)
  /\ state' = [state EXCEPT ![2] = "ran"]
  /\ runCount' = [runCount EXCEPT ![2] = @ + 1]
  /\ UNCHANGED submits

Next ==
  \/ BeginSubmit
  \/ DropDependent
  \/ \E p \in Proposals : RunSuccess(p)
  \/ \E p \in Proposals : RunFailed(p)
  \/ \E p \in Proposals : Park(p)
  \/ \E p \in Proposals : WeakReRunSettled(p)
  \/ WeakRunAfterDeadDep

Spec == Init /\ [][Next]_<<state, runCount, submits>>

NoSettledRerun == \A p \in Proposals : runCount[p] <= 1

NoRunAfterDeadDep ==
  state[2] # "ran" \/ state[1] = "ran"

DroppedImpliesDeadDep ==
  state[2] # "dropped" \/ state[1] \in {"failed", "dropped"}

Safety == TypeOK /\ NoSettledRerun /\ NoRunAfterDeadDep /\ DroppedImpliesDeadDep

=============================================================================
