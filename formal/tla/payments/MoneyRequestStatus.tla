-------------------------- MODULE MoneyRequestStatus --------------------------
(***************************************************************************)
(* Money request / invoice status graph (clawql-payments credits).         *)
(*                                                                         *)
(* pending → accepted → paid                                               *)
(* pending → declined | cancelled | expired                                *)
(* accepted → cancelled | expired                                          *)
(* Pay on paid is idempotent (no second payCount bump).                    *)
(*                                                                         *)
(* WeakSkipAccept = TRUE allows pending → paid; must COUNTEREXAMPLE        *)
(* PaidImpliesAccepted.                                                    *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakSkipAccept,   \* BOOLEAN — TRUE = mark paid without accept
  MaxClock

VARIABLES
  status,           \* none | pending | accepted | paid | declined | cancelled | expired
  clock,
  expiresAt,
  payCount,         \* number of pay effects (≤1)
  acceptedEver      \* sticky: Accept fired at least once

TypeOK ==
  /\ status \in {"none", "pending", "accepted", "paid", "declined", "cancelled", "expired"}
  /\ clock \in 0..MaxClock
  /\ expiresAt \in 0..MaxClock
  /\ payCount \in Nat
  /\ acceptedEver \in BOOLEAN

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ expiresAt = 0
  /\ payCount = 0
  /\ acceptedEver = FALSE

Create ==
  /\ status = "none"
  /\ status' = "pending"
  /\ expiresAt' = IF clock < MaxClock THEN clock + 1 ELSE clock
  /\ UNCHANGED <<clock, payCount, acceptedEver>>

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, expiresAt, payCount, acceptedEver>>

Accept ==
  /\ status = "pending"
  /\ clock <= expiresAt
  /\ status' = "accepted"
  /\ acceptedEver' = TRUE
  /\ UNCHANGED <<clock, expiresAt, payCount>>

Pay ==
  /\ ~WeakSkipAccept
  /\ status = "accepted"
  /\ clock <= expiresAt
  /\ status' = "paid"
  /\ payCount' = payCount + 1
  /\ UNCHANGED <<clock, expiresAt, acceptedEver>>

PayIdempotent ==
  /\ status = "paid"
  /\ UNCHANGED <<status, clock, expiresAt, payCount, acceptedEver>>

Decline ==
  /\ status = "pending"
  /\ clock <= expiresAt
  /\ status' = "declined"
  /\ UNCHANGED <<clock, expiresAt, payCount, acceptedEver>>

Cancel ==
  /\ status \in {"pending", "accepted"}
  /\ clock <= expiresAt
  /\ status' = "cancelled"
  /\ UNCHANGED <<clock, expiresAt, payCount, acceptedEver>>

Expire ==
  /\ status \in {"pending", "accepted"}
  /\ clock > expiresAt
  /\ status' = "expired"
  /\ UNCHANGED <<clock, expiresAt, payCount, acceptedEver>>

WeakPayFromPending ==
  /\ WeakSkipAccept
  /\ status = "pending"
  /\ status' = "paid"
  /\ payCount' = payCount + 1
  /\ UNCHANGED <<clock, expiresAt, acceptedEver>>

Next ==
  \/ Create
  \/ Tick
  \/ Accept
  \/ Pay
  \/ PayIdempotent
  \/ Decline
  \/ Cancel
  \/ Expire
  \/ WeakPayFromPending

Spec == Init /\ [][Next]_<<status, clock, expiresAt, payCount, acceptedEver>>

AtMostOnePay == payCount <= 1

PaidImpliesAccepted ==
  status # "paid" \/ acceptedEver

Safety == TypeOK /\ AtMostOnePay /\ PaidImpliesAccepted

=============================================================================
