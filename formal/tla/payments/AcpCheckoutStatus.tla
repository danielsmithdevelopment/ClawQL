--------------------------- MODULE AcpCheckoutStatus ---------------------------
(***************************************************************************)
(* ACP checkout session status graph (clawql-payments acp).                *)
(*                                                                         *)
(* none → ready_for_payment → completed                                    *)
(* not_ready → ready (MakeReady)                                           *)
(* not_ready | ready → canceled                                            *)
(* Complete on completed is idempotent (no second charge effect).          *)
(*                                                                         *)
(* WeakCompleteNotReady = TRUE allows complete from not_ready; must        *)
(* COUNTEREXAMPLE CompleteOnlyWhenReady.                                   *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakCompleteNotReady,  \* BOOLEAN — TRUE = complete before ready
  MaxClock

VARIABLES
  status,       \* none | not_ready | ready | completed | canceled
  clock,
  chargeCount,  \* Stripe PI / complete side effects (≤1)
  readyEver     \* sticky: session was ready at least once before complete

TypeOK ==
  /\ status \in {"none", "not_ready", "ready", "completed", "canceled"}
  /\ clock \in 0..MaxClock
  /\ chargeCount \in Nat
  /\ readyEver \in BOOLEAN

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ chargeCount = 0
  /\ readyEver = FALSE

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, chargeCount, readyEver>>

\* createSession today — lands ready_for_payment.
CreateReady ==
  /\ status = "none"
  /\ status' = "ready"
  /\ readyEver' = TRUE
  /\ UNCHANGED <<clock, chargeCount>>

\* Optional incomplete create path.
CreateNotReady ==
  /\ status = "none"
  /\ status' = "not_ready"
  /\ UNCHANGED <<clock, chargeCount, readyEver>>

MakeReady ==
  /\ status = "not_ready"
  /\ status' = "ready"
  /\ readyEver' = TRUE
  /\ UNCHANGED <<clock, chargeCount>>

Complete ==
  /\ ~WeakCompleteNotReady
  /\ status = "ready"
  /\ status' = "completed"
  /\ chargeCount' = chargeCount + 1
  /\ UNCHANGED <<clock, readyEver>>

CompleteIdempotent ==
  /\ status = "completed"
  /\ UNCHANGED <<status, clock, chargeCount, readyEver>>

Cancel ==
  /\ status \in {"not_ready", "ready"}
  /\ status' = "canceled"
  /\ UNCHANGED <<clock, chargeCount, readyEver>>

WeakCompleteFromNotReady ==
  /\ WeakCompleteNotReady
  /\ status = "not_ready"
  /\ status' = "completed"
  /\ chargeCount' = chargeCount + 1
  /\ UNCHANGED <<clock, readyEver>>

Next ==
  \/ Tick
  \/ CreateReady
  \/ CreateNotReady
  \/ MakeReady
  \/ Complete
  \/ CompleteIdempotent
  \/ Cancel
  \/ WeakCompleteFromNotReady

Spec == Init /\ [][Next]_<<status, clock, chargeCount, readyEver>>

AtMostOneCharge == chargeCount <= 1

CompleteOnlyWhenReady ==
  status # "completed" \/ readyEver

Safety == TypeOK /\ AtMostOneCharge /\ CompleteOnlyWhenReady

=============================================================================
