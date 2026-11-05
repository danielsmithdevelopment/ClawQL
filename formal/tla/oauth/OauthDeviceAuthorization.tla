------------------------ MODULE OauthDeviceAuthorization ------------------------
(***************************************************************************)
(* MCP OAuth §4 — RFC 8628 device authorization (ClawQL AS).               *)
(*                                                                         *)
(* none → pending → approved → consumed                                    *)
(* pending | approved → expired                                            *)
(* Consume deletes the code (single-use).                                  *)
(*                                                                         *)
(* WeakNoDelete = TRUE peeks without delete — must COUNTEREXAMPLE          *)
(* AtMostOneConsume.                                                       *)
(*                                                                         *)
(* Maps to: mcp-device-flow-transition.ts + mcp-device-flow.ts stores.      *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakNoDelete,   \* BOOLEAN — TRUE = consume without delete
  MaxClock

VARIABLES
  status,         \* none | pending | approved | consumed | expired
  clock,
  expiresAt,
  consumeCount,   \* successful consume effects (≤1 target)
  approvedEver

TypeOK ==
  /\ status \in {"none", "pending", "approved", "consumed", "expired"}
  /\ clock \in 0..MaxClock
  /\ expiresAt \in 0..MaxClock
  /\ consumeCount \in Nat
  /\ approvedEver \in BOOLEAN

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ expiresAt = 0
  /\ consumeCount = 0
  /\ approvedEver = FALSE

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, expiresAt, consumeCount, approvedEver>>

Issue ==
  /\ status = "none"
  /\ status' = "pending"
  /\ expiresAt' = IF clock < MaxClock THEN clock + 1 ELSE clock
  /\ UNCHANGED <<clock, consumeCount, approvedEver>>

Approve ==
  /\ status = "pending"
  /\ clock <= expiresAt
  /\ status' = "approved"
  /\ approvedEver' = TRUE
  /\ UNCHANGED <<clock, expiresAt, consumeCount>>

ApproveIdempotent ==
  /\ status = "approved"
  /\ clock <= expiresAt
  /\ UNCHANGED <<status, clock, expiresAt, consumeCount, approvedEver>>

\* Target: delete-on-read consume after approve.
Consume ==
  /\ ~WeakNoDelete
  /\ status = "approved"
  /\ clock <= expiresAt
  /\ status' = "consumed"
  /\ consumeCount' = consumeCount + 1
  /\ UNCHANGED <<clock, expiresAt, approvedEver>>

\* Weak: observe approved without delete — second consume possible.
WeakConsumeNoDelete ==
  /\ WeakNoDelete
  /\ status = "approved"
  /\ clock <= expiresAt
  /\ consumeCount' = consumeCount + 1
  /\ UNCHANGED <<status, clock, expiresAt, approvedEver>>

Expire ==
  /\ status \in {"pending", "approved"}
  /\ clock > expiresAt
  /\ status' = "expired"
  /\ UNCHANGED <<clock, expiresAt, consumeCount, approvedEver>>

ExpireIdempotent ==
  /\ status = "expired"
  /\ UNCHANGED <<status, clock, expiresAt, consumeCount, approvedEver>>

Next ==
  \/ Tick
  \/ Issue
  \/ Approve
  \/ ApproveIdempotent
  \/ Consume
  \/ WeakConsumeNoDelete
  \/ Expire
  \/ ExpireIdempotent

Spec == Init /\ [][Next]_<<status, clock, expiresAt, consumeCount, approvedEver>>

AtMostOneConsume == consumeCount <= 1

ConsumeImpliesApproved ==
  consumeCount = 0 \/ approvedEver

Safety == TypeOK /\ AtMostOneConsume /\ ConsumeImpliesApproved

=============================================================================
