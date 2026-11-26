---------------------------- MODULE X402Settlement ----------------------------
(***************************************************************************)
(* ClawQL x402 settle-before-allow — target safety model.                  *)
(*                                                                         *)
(* Models x402-enforcement-service.ts:                                     *)
(*   replay.seen → verify → settle → replay.remember → allow               *)
(*   X402_PAYMENT_RECEIVED only after settle (txHash present).             *)
(*                                                                         *)
(* Two replicas, each with its own in-process replay cache.                *)
(* Facilitator settle succeeds at most once per proof nonce unless         *)
(* WeakFacilitatorDoubleSettle = TRUE (bug oracle).                        *)
(*                                                                         *)
(* WeakSkipSettle = TRUE: allow after verify without settle                *)
(*   → breaks AllowImpliesSettled.                                         *)
(* WeakFacilitatorDoubleSettle = TRUE: facilitator accepts second settle   *)
(*   → breaks AllowAtMostOnce across replicas (replay cache alone is not   *)
(*   the guarantee; facilitator refusal is).                               *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Replicas,                      \* set of gateway replica ids
  Proofs,                        \* payment proof / authorization nonces
  WeakSkipSettle,                \* TRUE = allow after verify without settle
  WeakFacilitatorDoubleSettle    \* TRUE = facilitator accepts second settle

ASSUME
  /\ Replicas # {}
  /\ Proofs # {}

VARIABLES
  cache,          \* [r |-> SUBSET Proofs] per-replica replay.seen
  settled,        \* [p |-> Nat] facilitator settle successes for proof p
  allowed,        \* [p |-> Nat] allow count across all replicas
  received        \* [p |-> BOOLEAN] X402_PAYMENT_RECEIVED written

TypeOK ==
  /\ cache \in [Replicas -> SUBSET Proofs]
  /\ settled \in [Proofs -> Nat]
  /\ allowed \in [Proofs -> Nat]
  /\ received \in [Proofs -> BOOLEAN]

Init ==
  /\ cache = [r \in Replicas |-> {}]
  /\ settled = [p \in Proofs |-> 0]
  /\ allowed = [p \in Proofs |-> 0]
  /\ received = [p \in Proofs |-> FALSE]

\* Target path: seen → verify (implicit) → settle → remember → allow → RECEIVED.
AtomicAllow(r, p) ==
  /\ ~WeakSkipSettle
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \notin cache[r]
  /\ IF WeakFacilitatorDoubleSettle
     THEN TRUE
     ELSE settled[p] = 0
  /\ settled' = [settled EXCEPT ![p] = @ + 1]
  /\ cache' = [cache EXCEPT ![r] = @ \union {p}]
  /\ allowed' = [allowed EXCEPT ![p] = @ + 1]
  /\ received' = [received EXCEPT ![p] = TRUE]

\* Weak: allow after verify without settle (settle: false oracle).
WeakAllowSkipSettle(r, p) ==
  /\ WeakSkipSettle
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \notin cache[r]
  /\ cache' = [cache EXCEPT ![r] = @ \union {p}]
  /\ allowed' = [allowed EXCEPT ![p] = @ + 1]
  /\ UNCHANGED <<settled, received>>

\* Replay hit on this replica — deny, no state change.
ReplayDeny(r, p) ==
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \in cache[r]
  /\ UNCHANGED <<cache, settled, allowed, received>>

\* Facilitator refuses second settle (target) — deny when already settled.
FacilitatorRefuse(r, p) ==
  /\ ~WeakSkipSettle
  /\ ~WeakFacilitatorDoubleSettle
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \notin cache[r]
  /\ settled[p] >= 1
  /\ UNCHANGED <<cache, settled, allowed, received>>

Next ==
  \/ \E r \in Replicas, p \in Proofs : AtomicAllow(r, p)
  \/ \E r \in Replicas, p \in Proofs : WeakAllowSkipSettle(r, p)
  \/ \E r \in Replicas, p \in Proofs : ReplayDeny(r, p)
  \/ \E r \in Replicas, p \in Proofs : FacilitatorRefuse(r, p)

Spec == Init /\ [][Next]_<<cache, settled, allowed, received>>

-----------------------------------------------------------------------------
AllowImpliesSettled ==
  \A p \in Proofs : allowed[p] > 0 => settled[p] > 0

AllowAtMostOnce ==
  \A p \in Proofs : allowed[p] <= 1

ReceivedAfterSettle ==
  \A p \in Proofs : received[p] => settled[p] > 0

Safety ==
  /\ TypeOK
  /\ AllowImpliesSettled
  /\ AllowAtMostOnce
  /\ ReceivedAfterSettle

StateConstraint ==
  /\ \A p \in Proofs : settled[p] <= 2
  /\ \A p \in Proofs : allowed[p] <= 2

=============================================================================
