-------------------------- MODULE PendingSourceStatus --------------------------
(***************************************************************************)
(* Pending custom-source proposals (sources_propose / sources_approve).    *)
(*                                                                         *)
(* none → pending → approved | declined | expired                          *)
(* Approve/Decline only from pending; weak skip-pending COUNTEREXAMPLEs    *)
(* ApproveOnlyFromPending.                                                 *)
(*                                                                         *)
(* Maps to: pending-source-transition.ts + propose-source-core.ts.         *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakSkipPending,  \* BOOLEAN — TRUE = approve without pending
  MaxClock

VARIABLES
  status,           \* none | pending | approved | declined | expired
  clock,
  expiresAt,
  approveCount,     \* successful approve side effects (upsert source)
  pendingEver

TypeOK ==
  /\ status \in {"none", "pending", "approved", "declined", "expired"}
  /\ clock \in 0..MaxClock
  /\ expiresAt \in 0..MaxClock
  /\ approveCount \in Nat
  /\ pendingEver \in BOOLEAN

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ expiresAt = 0
  /\ approveCount = 0
  /\ pendingEver = FALSE

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, expiresAt, approveCount, pendingEver>>

Propose ==
  /\ status = "none"
  /\ status' = "pending"
  /\ pendingEver' = TRUE
  /\ expiresAt' = IF clock < MaxClock THEN clock + 1 ELSE clock
  /\ UNCHANGED <<clock, approveCount>>

Approve ==
  /\ ~WeakSkipPending
  /\ status = "pending"
  /\ clock <= expiresAt
  /\ status' = "approved"
  /\ approveCount' = approveCount + 1
  /\ UNCHANGED <<clock, expiresAt, pendingEver>>

ApproveIdempotent ==
  /\ status = "approved"
  /\ UNCHANGED <<status, clock, expiresAt, approveCount, pendingEver>>

Decline ==
  /\ status = "pending"
  /\ clock <= expiresAt
  /\ status' = "declined"
  /\ UNCHANGED <<clock, expiresAt, approveCount, pendingEver>>

Expire ==
  /\ status = "pending"
  /\ clock > expiresAt
  /\ status' = "expired"
  /\ UNCHANGED <<clock, expiresAt, approveCount, pendingEver>>

\* Weak: register source without ever being pending.
WeakApproveSkipPending ==
  /\ WeakSkipPending
  /\ status \in {"none", "expired", "declined"}
  /\ status' = "approved"
  /\ approveCount' = approveCount + 1
  /\ UNCHANGED <<clock, expiresAt, pendingEver>>

Next ==
  \/ Tick
  \/ Propose
  \/ Approve
  \/ ApproveIdempotent
  \/ Decline
  \/ Expire
  \/ WeakApproveSkipPending

Spec == Init /\ [][Next]_<<status, clock, expiresAt, approveCount, pendingEver>>

AtMostOneApprove == approveCount <= 1

ApproveOnlyFromPending ==
  approveCount = 0 \/ pendingEver

Safety == TypeOK /\ AtMostOneApprove /\ ApproveOnlyFromPending

=============================================================================
