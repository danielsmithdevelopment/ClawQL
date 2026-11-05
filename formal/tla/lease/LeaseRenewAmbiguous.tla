--------------------------- MODULE LeaseRenewAmbiguous ---------------------------
(***************************************************************************)
(* Ambiguous node-lease renewal vs mid-flight intent.                      *)
(*                                                                         *)
(* A renew CAS may reach R2 and still return Ambiguous to the owner        *)
(* (timeout / transport). Storage truth and owner belief can diverge:      *)
(*                                                                         *)
(*   - Storage extended, owner did not update belief → owner may self-     *)
(*     fence or under-renew while still holding.                           *)
(*   - Storage did NOT extend, owner still believes it holds → owner keeps *)
(*     writing past storage expiry; survivor may take over and drop a      *)
(*     mid-flight intent (lost_midflight_intent lead).                     *)
(*                                                                         *)
(* WeakIgnoreAmbiguousDivergence = TRUE: owner optimistically bumps belief *)
(* after Ambiguous without readback (unsafe class). TLC must               *)
(* counterexample. Product celld does NOT do this: Ambiguous → readback,   *)
(* authority stays on last confirmed apply (see AMBIGUOUS_RENEWAL.md).     *)
(* Keep the weak config as a regression tooth.                             *)
(*                                                                         *)
(* Target FALSE: after Ambiguous, owner must not treat belief as           *)
(* authority for a mid-flight write once storage is expired — fence or     *)
(* stop writing until readback reconciles.                                 *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakIgnoreAmbiguousDivergence,  \* BOOLEAN
  MaxClock

VARIABLES
  clock,
  storageExpiresAt,     \* truth in the lease store
  ownerBeliefExpiresAt, \* what the owner last successfully applied
  renewInFlight,
  \* When renew resolves Ambiguous, nondet whether storage actually applied.
  pendingStorageApplied,
  ownerWriting,         \* mid-flight intent (not yet durable)
  intentDurable,
  intentEverInFlight,
  survivorTookOver,
  intentDropped         \* survivor recovery dropped mid-flight intent

\* Expiry timestamps may sit slightly past MaxClock after a renew extend.
MaxExpiry == MaxClock + 2

TypeOK ==
  /\ clock \in 0..MaxClock
  /\ storageExpiresAt \in 0..MaxExpiry
  /\ ownerBeliefExpiresAt \in 0..MaxExpiry
  /\ renewInFlight \in BOOLEAN
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
                 pendingStorageApplied, ownerWriting, intentDurable,
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
                 pendingStorageApplied, intentDurable, survivorTookOver,
                 intentDropped>>

LandIntent ==
  /\ ownerWriting
  /\ ~intentDurable
  /\ ~intentDropped
  /\ ~survivorTookOver
  /\ intentDurable' = TRUE
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 pendingStorageApplied, intentEverInFlight, survivorTookOver,
                 intentDropped>>

\* Owner starts a renew while belief headroom is low.
StartRenew ==
  /\ ~renewInFlight
  /\ ~survivorTookOver
  /\ ownerBeliefExpiresAt <= clock + 1
  /\ renewInFlight' = TRUE
  /\ pendingStorageApplied' \in BOOLEAN   \* nondet: will storage apply?
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, ownerWriting,
                 intentDurable, intentEverInFlight, survivorTookOver,
                 intentDropped>>

ExtendTo(cur) ==
  LET raw == IF cur > clock THEN cur + 2 ELSE clock + 2
  IN IF raw > MaxExpiry THEN MaxExpiry ELSE raw

\* Clean apply: both sides extend.
RenewApplied ==
  /\ renewInFlight
  /\ pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = ExtendTo(storageExpiresAt)
  /\ ownerBeliefExpiresAt' = storageExpiresAt'
  /\ UNCHANGED <<clock, pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

\* Clean reject: storage did not extend; owner learns it.
RenewRejected ==
  /\ renewInFlight
  /\ ~pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt,
                 pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

\* Ambiguous timeout: storage may or may not have applied the CAS.
\* WeakIgnoreAmbiguousDivergence: owner optimistically bumps belief (assumes
\* success) without readback — if storage did not apply, belief > storage.
\* Target: owner leaves belief unchanged until readback reconciles.
RenewAmbiguous ==
  /\ renewInFlight
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = IF pendingStorageApplied
                           THEN ExtendTo(storageExpiresAt)
                           ELSE storageExpiresAt
  /\ ownerBeliefExpiresAt' =
       IF WeakIgnoreAmbiguousDivergence
         THEN ExtendTo(ownerBeliefExpiresAt)
         ELSE ownerBeliefExpiresAt
  /\ UNCHANGED <<clock, pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

StorageExpired == storageExpiresAt <= clock
OwnerBelievesHolding == ownerBeliefExpiresAt > clock

\* Survivor takeover on storage expiry (fenced).
\* WeakIgnoreAmbiguousDivergence: owner kept writing on stale belief after
\* Ambiguous → takeover may drop the mid-flight intent (counterexample).
\* Target: fencing / readback means takeover must not drop that intent
\* (same spirit as expiry≠dead: expiry permits fence, not abandon).
SurvivorTakeover ==
  /\ ~survivorTookOver
  /\ StorageExpired
  /\ survivorTookOver' = TRUE
  /\ intentDropped' =
       IF WeakIgnoreAmbiguousDivergence /\ ownerWriting /\ OwnerBelievesHolding
         THEN TRUE
         ELSE intentDropped
  /\ ownerWriting' = IF intentDropped' THEN FALSE ELSE ownerWriting
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 pendingStorageApplied, intentDurable, intentEverInFlight>>

\* Target: once storage is expired but belief still says holding (typical
\* after Ambiguous without readback), stop writing until reconciled.
OwnerFenceOnDivergence ==
  /\ ~WeakIgnoreAmbiguousDivergence
  /\ OwnerBelievesHolding
  /\ StorageExpired
  /\ ownerWriting
  /\ ~survivorTookOver
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<clock, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 pendingStorageApplied, intentDurable, intentEverInFlight,
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
  renewInFlight, pendingStorageApplied, ownerWriting, intentDurable,
  intentEverInFlight, survivorTookOver, intentDropped>>

-----------------------------------------------------------------------------
\* Mid-flight intent must not be dropped by survivor takeover under belief
\* divergence after an ambiguous renew path.
IntentPreserved ==
  ~(intentDropped /\ intentEverInFlight /\ ~intentDurable)

Safety == TypeOK /\ IntentPreserved

=============================================================================
