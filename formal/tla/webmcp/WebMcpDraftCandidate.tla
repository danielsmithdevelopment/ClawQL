------------------------- MODULE WebMcpDraftCandidate -------------------------
(***************************************************************************)
(* WebMCP draft candidate lifecycle (webmcp-draft provider).               *)
(*                                                                         *)
(* none → pending → approved → published                                   *)
(* pending → rejected                                                      *)
(* Publish only from approved; weak publish-from-pending COUNTEREXAMPLEs   *)
(* PublishOnlyWhenApproved.                                                *)
(*                                                                         *)
(* Maps to: draft-candidate-transition.ts + draft-store.ts.                *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakPublishPending,  \* BOOLEAN — TRUE = publish without approve
  MaxClock

VARIABLES
  status,              \* none | pending | approved | rejected | published
  clock,
  publishCount,        \* successful publish effects (≤1)
  approvedEver

TypeOK ==
  /\ status \in {"none", "pending", "approved", "rejected", "published"}
  /\ clock \in 0..MaxClock
  /\ publishCount \in Nat
  /\ approvedEver \in BOOLEAN

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ publishCount = 0
  /\ approvedEver = FALSE

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, publishCount, approvedEver>>

Draft ==
  /\ status = "none"
  /\ status' = "pending"
  /\ UNCHANGED <<clock, publishCount, approvedEver>>

Approve ==
  /\ status = "pending"
  /\ status' = "approved"
  /\ approvedEver' = TRUE
  /\ UNCHANGED <<clock, publishCount>>

Reject ==
  /\ status = "pending"
  /\ status' = "rejected"
  /\ UNCHANGED <<clock, publishCount, approvedEver>>

Publish ==
  /\ ~WeakPublishPending
  /\ status = "approved"
  /\ status' = "published"
  /\ publishCount' = publishCount + 1
  /\ UNCHANGED <<clock, approvedEver>>

PublishIdempotent ==
  /\ status = "published"
  /\ UNCHANGED <<status, clock, publishCount, approvedEver>>

WeakPublishFromPending ==
  /\ WeakPublishPending
  /\ status = "pending"
  /\ status' = "published"
  /\ publishCount' = publishCount + 1
  /\ UNCHANGED <<clock, approvedEver>>

Next ==
  \/ Tick
  \/ Draft
  \/ Approve
  \/ Reject
  \/ Publish
  \/ PublishIdempotent
  \/ WeakPublishFromPending

Spec == Init /\ [][Next]_<<status, clock, publishCount, approvedEver>>

AtMostOnePublish == publishCount <= 1

PublishOnlyWhenApproved ==
  publishCount = 0 \/ approvedEver

Safety == TypeOK /\ AtMostOnePublish /\ PublishOnlyWhenApproved

=============================================================================
