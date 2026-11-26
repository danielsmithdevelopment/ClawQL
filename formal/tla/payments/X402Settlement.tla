---------------------------- MODULE X402Settlement ----------------------------
(***************************************************************************)
(* ClawQL x402 settle-before-allow — target safety model.                  *)
(*                                                                         *)
(* Models x402-enforcement-service.ts as separate steps (not one atomic):  *)
(*   StartRequest:  replay.seen check → mark inflight                      *)
(*   SettleAllow:   settle → remember → allow → X402_PAYMENT_RECEIVED      *)
(*                                                                         *)
(* Two inflight requests on the same replica can both pass `seen` before   *)
(* either remembers — that race is in the state space. AllowAtMostOnce     *)
(* then holds only because the facilitator refuses a second settle.        *)
(*                                                                         *)
(* WeakSkipSettle = TRUE: SettleAllow skips settle                         *)
(*   → breaks AllowImpliesSettled.                                         *)
(* WeakFacilitatorDoubleSettle = TRUE: facilitator accepts second settle   *)
(*   → breaks AllowAtMostOnce across replicas / same-replica race.         *)
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
  cache,          \* [r |-> SUBSET Proofs] per-replica replay.remember
  inflight,       \* [r |-> SUBSET Proofs] passed seen, not yet remembered
  settled,        \* [p |-> Nat] facilitator settle successes for proof p
  allowed,        \* [p |-> Nat] allow count across all replicas
  received        \* [p |-> BOOLEAN] X402_PAYMENT_RECEIVED written

TypeOK ==
  /\ cache \in [Replicas -> SUBSET Proofs]
  /\ inflight \in [Replicas -> SUBSET Proofs]
  /\ settled \in [Proofs -> Nat]
  /\ allowed \in [Proofs -> Nat]
  /\ received \in [Proofs -> BOOLEAN]

Init ==
  /\ cache = [r \in Replicas |-> {}]
  /\ inflight = [r \in Replicas |-> {}]
  /\ settled = [p \in Proofs |-> 0]
  /\ allowed = [p \in Proofs |-> 0]
  /\ received = [p \in Proofs |-> FALSE]

\* Step 1: check replay.seen — both requests can pass before either remembers.
StartRequest(r, p) ==
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \notin cache[r]
  /\ p \notin inflight[r]
  /\ inflight' = [inflight EXCEPT ![r] = @ \union {p}]
  /\ UNCHANGED <<cache, settled, allowed, received>>

\* Step 2: settle (unless weak skip) then remember + allow + RECEIVED.
SettleAllow(r, p) ==
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \in inflight[r]
  /\ IF WeakSkipSettle
     THEN TRUE
     ELSE IF WeakFacilitatorDoubleSettle
          THEN TRUE
          ELSE settled[p] = 0
  /\ IF WeakSkipSettle
     THEN settled' = settled
     ELSE settled' = [settled EXCEPT ![p] = @ + 1]
  /\ cache' = [cache EXCEPT ![r] = @ \union {p}]
  /\ inflight' = [inflight EXCEPT ![r] = @ \ {p}]
  /\ allowed' = [allowed EXCEPT ![p] = @ + 1]
  /\ received' = IF WeakSkipSettle
                 THEN received
                 ELSE [received EXCEPT ![p] = TRUE]

\* Facilitator refuses second settle while request is still inflight.
FacilitatorRefuse(r, p) ==
  /\ ~WeakSkipSettle
  /\ ~WeakFacilitatorDoubleSettle
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \in inflight[r]
  /\ settled[p] >= 1
  /\ inflight' = [inflight EXCEPT ![r] = @ \ {p}]
  /\ UNCHANGED <<cache, settled, allowed, received>>

\* Late replay hit after remember.
ReplayDeny(r, p) ==
  /\ r \in Replicas
  /\ p \in Proofs
  /\ p \in cache[r]
  /\ UNCHANGED <<cache, inflight, settled, allowed, received>>

Next ==
  \/ \E r \in Replicas, p \in Proofs : StartRequest(r, p)
  \/ \E r \in Replicas, p \in Proofs : SettleAllow(r, p)
  \/ \E r \in Replicas, p \in Proofs : FacilitatorRefuse(r, p)
  \/ \E r \in Replicas, p \in Proofs : ReplayDeny(r, p)

Spec == Init /\ [][Next]_<<cache, inflight, settled, allowed, received>>

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
  /\ \A r \in Replicas : Cardinality(inflight[r]) <= Cardinality(Proofs)

=============================================================================
