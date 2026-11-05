--------------------------- MODULE LeaseRenewAmbiguous ---------------------------
(***************************************************************************)
(* Ambiguous / late node-lease renewal vs mid-flight intent.               *)
(*                                                                         *)
(* Divergence classes (belief > storage → write past expiry → survivor     *)
(* drops mid-flight intent):                                               *)
(*                                                                         *)
(* 1. WeakIgnoreAmbiguousDivergence: owner optimistically bumps belief     *)
(*    after Ambiguous without readback. Product does NOT: Ambiguous →      *)
(*    readback; authority stays on last confirmed apply.                   *)
(*                                                                         *)
(* 2. WeakStampAuthorityAtResponse: renew CAS body (and storage expiry)    *)
(*    is computed at request *send*, but owner stamps local authority at   *)
(*    Applied *receipt*. Slow RTT stretches belief past storage by the     *)
(*    response latency. Product does NOT: PendingNodeLease.anchor_mono_ms  *)
(*    is the send instant; last_ok_mono_ms := anchor (see                 *)
(*    AMBIGUOUS_RENEWAL.md).                                               *)
(*                                                                         *)
(* Target: both weak constants FALSE. Keep weak configs as regression      *)
(* teeth.                                                                  *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakIgnoreAmbiguousDivergence,  \* BOOLEAN — optimistic Ambiguous bump
  WeakStampAuthorityAtResponse,   \* BOOLEAN — authority stamped at receipt
  MaxClock

VARIABLES
  clock,
  storageExpiresAt,     \* truth in the lease store (expires from CAS body)
  ownerBeliefExpiresAt, \* local authority deadline
  renewInFlight,
  renewSentAt,          \* clock when renew request / CAS body was formed
  \* When renew resolves Ambiguous, nondet whether storage actually applied.
  pendingStorageApplied,
  ownerWriting,         \* mid-flight intent (not yet durable)
  intentDurable,
  intentEverInFlight,
  survivorTookOver,
  intentDropped         \* survivor recovery dropped mid-flight intent

\* Receipt-stamped belief can land slightly past MaxClock + TTL step.
MaxExpiry == MaxClock + 4

TypeOK ==
  /\ clock \in 0..MaxClock
  /\ storageExpiresAt \in 0..MaxExpiry
  /\ ownerBeliefExpiresAt \in 0..MaxExpiry
  /\ renewInFlight \in BOOLEAN
  /\ renewSentAt \in 0..MaxClock
  /\ pendingStorageApplied \in BOOLEAN
  /\ ownerWriting \in BOOLEAN
  /\ intentDurable \in BOOLEAN
  /\ intentEverInFlight \in BOOLEAN
  /\ survivorTookOver \in BOOLEAN
  /\ intentDropped \in BOOLEAN

-----------------------------------------------------------------------------
Init ==
  /\ clock = 0
  /\ storageExpiresAt = 2
  /\ ownerBeliefExpiresAt = 2
  /\ renewInFlight = FALSE
  /\ renewSentAt = 0
  /\ pendingStorageApplied = FALSE
  /\ ownerWriting = FALSE
  /\ intentDurable = FALSE
  /\ intentEverInFlight = FALSE
  /\ survivorTookOver = FALSE
  /\ intentDropped = FALSE

-----------------------------------------------------------------------------
Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentAt, pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

StartWrite ==
  /\ ~ownerWriting
  /\ ~intentDurable
  /\ ~intentEverInFlight
  /\ ~survivorTookOver
  /\ ownerBeliefExpiresAt > clock   \* owner believes it still holds
  /\ ownerWriting' = TRUE
  /\ intentEverInFlight' = TRUE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentAt, pendingStorageApplied, intentDurable, survivorTookOver,
                 intentDropped>>

LandIntent ==
  /\ ownerWriting
  /\ ~intentDurable
  /\ ~intentDropped
  /\ ~survivorTookOver
  /\ intentDurable' = TRUE
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentAt, pendingStorageApplied, intentEverInFlight, survivorTookOver,
                 intentDropped>>

\* Owner starts a renew while belief headroom is low.
\* CAS body expires_ms is sampled here (send) — same instant as product
\* PendingNodeLease.anchor_mono_ms / desired.expires_ms.
StartRenew ==
  /\ ~renewInFlight
  /\ ~survivorTookOver
  /\ ownerBeliefExpiresAt <= clock + 1
  /\ renewInFlight' = TRUE
  /\ renewSentAt' = clock
  /\ pendingStorageApplied' \in BOOLEAN   \* nondet: will storage apply?
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, ownerWriting,
                 intentDurable, intentEverInFlight, survivorTookOver,
                 intentDropped>>

\* Extend relative to an anchor (send or receipt clock), not "now" alone.
ExtendToAt(anchor, cur) ==
  LET raw == IF cur > anchor THEN cur + 2 ELSE anchor + 2
  IN IF raw > MaxExpiry THEN MaxExpiry ELSE raw

\* Clean apply. Storage always takes the send-anchored body.
\* Product: belief also send-anchored (last_ok := anchor_mono_ms).
\* WeakStampAuthorityAtResponse: belief stamped at receipt (clock).
RenewApplied ==
  /\ renewInFlight
  /\ pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = ExtendToAt(renewSentAt, storageExpiresAt)
  /\ ownerBeliefExpiresAt' =
       IF WeakStampAuthorityAtResponse
         THEN ExtendToAt(clock, ownerBeliefExpiresAt)
         ELSE storageExpiresAt'
  /\ UNCHANGED <<clock, renewSentAt, pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

\* Clean reject: storage did not extend; owner learns it.
RenewRejected ==
  /\ renewInFlight
  /\ ~pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewSentAt,
                 pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

\* Ambiguous timeout: storage may or may not have applied the CAS.
\* WeakIgnoreAmbiguousDivergence: owner optimistically bumps belief (assumes
\* success) without readback — if storage did not apply, belief > storage.
\* Target / product: belief unchanged until readback; storage may still extend
\* from the send-anchored body if the CAS landed.
RenewAmbiguous ==
  /\ renewInFlight
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = IF pendingStorageApplied
                           THEN ExtendToAt(renewSentAt, storageExpiresAt)
                           ELSE storageExpiresAt
  /\ ownerBeliefExpiresAt' =
       IF WeakIgnoreAmbiguousDivergence
         THEN ExtendToAt(clock, ownerBeliefExpiresAt)
         ELSE ownerBeliefExpiresAt
  /\ UNCHANGED <<clock, renewSentAt, pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

StorageExpired == storageExpiresAt <= clock
OwnerBelievesHolding == ownerBeliefExpiresAt > clock

UnsafeBeliefPastStorage ==
  WeakIgnoreAmbiguousDivergence \/ WeakStampAuthorityAtResponse

\* Survivor takeover on storage expiry (fenced).
\* Either weak class can leave belief holding past storage → drop mid-flight.
SurvivorTakeover ==
  /\ ~survivorTookOver
  /\ StorageExpired
  /\ survivorTookOver' = TRUE
  /\ intentDropped' =
       IF UnsafeBeliefPastStorage /\ ownerWriting /\ OwnerBelievesHolding
         THEN TRUE
         ELSE intentDropped
  /\ ownerWriting' = IF intentDropped' THEN FALSE ELSE ownerWriting
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentAt, pendingStorageApplied, intentDurable, intentEverInFlight>>

\* Target: once storage is expired but belief still says holding, stop writing.
OwnerFenceOnDivergence ==
  /\ ~WeakIgnoreAmbiguousDivergence
  /\ ~WeakStampAuthorityAtResponse
  /\ OwnerBelievesHolding
  /\ StorageExpired
  /\ ownerWriting
  /\ ~survivorTookOver
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentAt, pendingStorageApplied, intentDurable, intentEverInFlight,
                 survivorTookOver, intentDropped>>

-----------------------------------------------------------------------------
Next ==
  \/ Tick
  \/ StartWrite
  \/ LandIntent
  \/ StartRenew
  \/ RenewApplied
  \/ RenewRejected
  \/ RenewAmbiguous
  \/ SurvivorTakeover
  \/ OwnerFenceOnDivergence

Spec == Init /\ [][Next]_<<clock, storageExpiresAt, ownerBeliefExpiresAt,
  renewInFlight, renewSentAt, pendingStorageApplied, ownerWriting, intentDurable,
  intentEverInFlight, survivorTookOver, intentDropped>>

-----------------------------------------------------------------------------
\* Mid-flight intent must not be dropped by survivor takeover under belief
\* divergence (Ambiguous optimistic bump or receipt-stamped authority).
IntentPreserved ==
  ~(intentDropped /\ intentEverInFlight /\ ~intentDurable)

Safety == TypeOK /\ IntentPreserved

=============================================================================
