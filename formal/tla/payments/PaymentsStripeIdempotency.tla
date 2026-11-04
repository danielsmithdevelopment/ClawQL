------------------------ MODULE PaymentsStripeIdempotency ------------------------
(***************************************************************************)
(* ClawQL payments — Stripe PaymentIntent create with write-ahead key.     *)
(*                                                                         *)
(* Target: persist idempotency key → Stripe create(key) → record PI id.    *)
(* Crash between Stripe and record: retry reuses key → same PI (no second  *)
(* charge). After Stripe's ~24h idempotency TTL, recover by metadata       *)
(* (check-then-decide) before any new create.                              *)
(*                                                                         *)
(* WeakWriteAhead = TRUE creates without prior key write (bug oracle).     *)
(*                                                                         *)
(* Invariant: AtMostOneCharge — charges[c] ≤ 1 for each checkout/top-up.   *)
(* A crash between the Stripe call and the record never leads to a second  *)
(* charge under the atomic path.                                           *)
(***************************************************************************)

EXTENDS Naturals, Sequences, TLC

CONSTANTS
  MaxCheckouts,
  WeakWriteAhead      \* TRUE = call Stripe before durable key (bug oracle)

VARIABLES
  keys,               \* [c |-> {"none","written","expired"}]
  charges,            \* [c |-> Nat] successful Stripe creates (distinct PIs)
  piRecorded,         \* [c |-> BOOLEAN] local payment_intent_id persisted
  nextCid,
  clock

Cid == 1..MaxCheckouts

TypeOK ==
  /\ nextCid \in 1..(MaxCheckouts + 1)
  /\ clock \in Nat
  /\ keys \in [Cid -> {"none", "written", "expired"}]
  /\ charges \in [Cid -> Nat]
  /\ piRecorded \in [Cid -> BOOLEAN]

Init ==
  /\ keys = [c \in Cid |-> "none"]
  /\ charges = [c \in Cid |-> 0]
  /\ piRecorded = [c \in Cid |-> FALSE]
  /\ nextCid = 1
  /\ clock = 0

\* Open a checkout / top-up slot.
Open ==
  /\ nextCid <= MaxCheckouts
  /\ nextCid' = nextCid + 1
  /\ UNCHANGED <<keys, charges, piRecorded, clock>>

\* Write-ahead: durable key before Stripe.
WriteKey(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "none"
  /\ keys' = [keys EXCEPT ![c] = "written"]
  /\ UNCHANGED <<charges, piRecorded, nextCid, clock>>

\* Target Stripe create — only after key written; at most one charge.
StripeCreateAtomic(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "written"
  /\ charges[c] = 0
  /\ charges' = [charges EXCEPT ![c] = 1]
  /\ UNCHANGED <<keys, piRecorded, nextCid, clock>>

\* Retry after crash: key already written, charge may already be 1 — no new charge.
StripeRetrySameKey(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "written"
  /\ charges[c] = 1
  /\ UNCHANGED <<keys, charges, piRecorded, nextCid, clock>>

\* Stripe ~24h window ends; key no longer guaranteed by Stripe.
ExpireKey(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "written"
  /\ ~piRecorded[c]
  /\ keys' = [keys EXCEPT ![c] = "expired"]
  /\ UNCHANGED <<charges, piRecorded, nextCid, clock>>

\* After TTL: look up PI by metadata; do not create a second charge.
MetadataRecover(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "expired"
  /\ charges[c] = 1
  /\ piRecorded' = [piRecorded EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<keys, charges, nextCid, clock>>

\* After TTL with successful search and no PI: first create is still at most one charge.
PostTtlCreateWhenNotFound(c) ==
  /\ ~WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ keys[c] = "expired"
  /\ charges[c] = 0
  /\ charges' = [charges EXCEPT ![c] = 1]
  /\ UNCHANGED <<keys, piRecorded, nextCid, clock>>

\* Persist local PI id after Stripe returns (within TTL).
RecordPi(c) ==
  /\ c \in Cid
  /\ c < nextCid
  /\ charges[c] >= 1
  /\ keys[c] \in {"written", "expired"}
  /\ piRecorded' = [piRecorded EXCEPT ![c] = TRUE]
  /\ UNCHANGED <<keys, charges, nextCid, clock>>

\* Weak: Stripe create without write-ahead key (can double-charge on retry).
WeakStripeCreate(c) ==
  /\ WeakWriteAhead
  /\ c \in Cid
  /\ c < nextCid
  /\ charges' = [charges EXCEPT ![c] = @ + 1]
  /\ UNCHANGED <<keys, piRecorded, nextCid, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<keys, charges, piRecorded, nextCid>>

Next ==
  \/ Open
  \/ \E c \in Cid : WriteKey(c)
  \/ \E c \in Cid : StripeCreateAtomic(c)
  \/ \E c \in Cid : StripeRetrySameKey(c)
  \/ \E c \in Cid : ExpireKey(c)
  \/ \E c \in Cid : MetadataRecover(c)
  \/ \E c \in Cid : PostTtlCreateWhenNotFound(c)
  \/ \E c \in Cid : RecordPi(c)
  \/ \E c \in Cid : WeakStripeCreate(c)
  \/ Tick

vars == <<keys, charges, piRecorded, nextCid, clock>>

Spec == Init /\ [][Next]_vars

AtMostOneCharge ==
  \A c \in Cid : charges[c] <= 1

\* Under atomic path, a recorded PI implies exactly one charge.
RecordedImpliesCharge ==
  \A c \in Cid :
    piRecorded[c] => charges[c] = 1 \/ WeakWriteAhead

Safety ==
  /\ TypeOK
  /\ AtMostOneCharge

StateConstraint ==
  /\ clock <= 6
  /\ nextCid <= MaxCheckouts + 1

=============================================================================
