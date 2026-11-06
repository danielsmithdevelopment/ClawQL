--------------------------- MODULE LeaseRenewAmbiguous ---------------------------
(***************************************************************************)
(* Ambiguous / late / paused node-lease renewal vs mid-flight intent.      *)
(*                                                                         *)
(* Divergence classes (belief > storage → write past expiry → survivor     *)
(* drops mid-flight intent):                                               *)
(*                                                                         *)
(* 1. WeakIgnoreAmbiguousDivergence: optimistic belief bump after          *)
(*    Ambiguous without readback. Product does NOT.                        *)
(*                                                                         *)
(* 2. WeakStampAuthorityAtResponse: stamp local authority at Applied       *)
(*    receipt while storage expiry was sampled at send. Product does NOT   *)
(*    (anchor_mono_ms at send).                                            *)
(*                                                                         *)
(* 3. WeakHolderClockPaused: wall/storage time advances while holder       *)
(*    CLOCK_MONOTONIC (send-anchored belief) is frozen — VM suspend.       *)
(*    Product TODAY uses Instant/mono for last_ok (asyncrt::mono_ms);      *)
(*    peers/storage use wall expires_ms. Pause-aware BOOTTIME is the       *)
(*    pending fix. Keep this weak config as the tooth.                     *)
(*                                                                         *)
(* Target: all weak constants FALSE.                                       *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakIgnoreAmbiguousDivergence,  \* BOOLEAN — optimistic Ambiguous bump
  WeakStampAuthorityAtResponse,   \* BOOLEAN — authority stamped at receipt
  WeakHolderClockPaused,          \* BOOLEAN — wall advances, holder mono frozen
  MaxClock

VARIABLES
  wallClock,            \* storage / peer wall time
  holderNow,            \* holder monotonic "now" (stops under pause)
  storageExpiresAt,     \* truth in the lease store (expires from CAS body)
  ownerBeliefExpiresAt, \* local authority deadline on holder mono axis
  renewInFlight,
  renewSentWall,        \* wall clock at renew send (CAS body)
  renewSentMono,        \* holder mono at renew send (anchor)
  pendingStorageApplied,
  ownerWriting,
  intentDurable,
  intentEverInFlight,
  survivorTookOver,
  intentDropped

MaxExpiry == MaxClock + 4

TypeOK ==
  /\ wallClock \in 0..MaxClock
  /\ holderNow \in 0..MaxClock
  /\ storageExpiresAt \in 0..MaxExpiry
  /\ ownerBeliefExpiresAt \in 0..MaxExpiry
  /\ renewInFlight \in BOOLEAN
  /\ renewSentWall \in 0..MaxClock
  /\ renewSentMono \in 0..MaxClock
  /\ pendingStorageApplied \in BOOLEAN
  /\ ownerWriting \in BOOLEAN
  /\ intentDurable \in BOOLEAN
  /\ intentEverInFlight \in BOOLEAN
  /\ survivorTookOver \in BOOLEAN
  /\ intentDropped \in BOOLEAN
  /\ holderNow <= wallClock

-----------------------------------------------------------------------------
Init ==
  /\ wallClock = 0
  /\ holderNow = 0
  /\ storageExpiresAt = 2
  /\ ownerBeliefExpiresAt = 2
  /\ renewInFlight = FALSE
  /\ renewSentWall = 0
  /\ renewSentMono = 0
  /\ pendingStorageApplied = FALSE
  /\ ownerWriting = FALSE
  /\ intentDurable = FALSE
  /\ intentEverInFlight = FALSE
  /\ survivorTookOver = FALSE
  /\ intentDropped = FALSE

-----------------------------------------------------------------------------
\* Normal time: wall and holder mono advance together.
TickBoth ==
  /\ wallClock < MaxClock
  /\ wallClock' = wallClock + 1
  /\ holderNow' = holderNow + 1
  /\ UNCHANGED <<storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentWall, renewSentMono, pendingStorageApplied, ownerWriting,
                 intentDurable, intentEverInFlight, survivorTookOver, intentDropped>>

\* VM suspend: wall keeps running, holder Instant/mono stops.
TickPause ==
  /\ WeakHolderClockPaused
  /\ wallClock < MaxClock
  /\ wallClock' = wallClock + 1
  /\ UNCHANGED <<holderNow, storageExpiresAt, ownerBeliefExpiresAt, renewInFlight,
                 renewSentWall, renewSentMono, pendingStorageApplied, ownerWriting,
                 intentDurable, intentEverInFlight, survivorTookOver, intentDropped>>

StartWrite ==
  /\ ~ownerWriting
  /\ ~intentDurable
  /\ ~intentEverInFlight
  /\ ~survivorTookOver
  /\ ownerBeliefExpiresAt > holderNow
  /\ ownerWriting' = TRUE
  /\ intentEverInFlight' = TRUE
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 renewInFlight, renewSentWall, renewSentMono, pendingStorageApplied,
                 intentDurable, survivorTookOver, intentDropped>>

LandIntent ==
  /\ ownerWriting
  /\ ~intentDurable
  /\ ~intentDropped
  /\ ~survivorTookOver
  /\ intentDurable' = TRUE
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 renewInFlight, renewSentWall, renewSentMono, pendingStorageApplied,
                 intentEverInFlight, survivorTookOver, intentDropped>>

StartRenew ==
  /\ ~renewInFlight
  /\ ~survivorTookOver
  /\ ownerBeliefExpiresAt <= holderNow + 1
  /\ renewInFlight' = TRUE
  /\ renewSentWall' = wallClock
  /\ renewSentMono' = holderNow
  /\ pendingStorageApplied' \in BOOLEAN
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 ownerWriting, intentDurable, intentEverInFlight, survivorTookOver,
                 intentDropped>>

ExtendToAt(anchor, cur) ==
  LET raw == IF cur > anchor THEN cur + 2 ELSE anchor + 2
  IN IF raw > MaxExpiry THEN MaxExpiry ELSE raw

RenewApplied ==
  /\ renewInFlight
  /\ pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = ExtendToAt(renewSentWall, storageExpiresAt)
  /\ ownerBeliefExpiresAt' =
       IF WeakStampAuthorityAtResponse
         THEN ExtendToAt(holderNow, ownerBeliefExpiresAt)  \* receipt mono
         ELSE ExtendToAt(renewSentMono, ownerBeliefExpiresAt)  \* send mono (product)
  /\ UNCHANGED <<wallClock, holderNow, renewSentWall, renewSentMono,
                 pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

RenewRejected ==
  /\ renewInFlight
  /\ ~pendingStorageApplied
  /\ renewInFlight' = FALSE
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 renewSentWall, renewSentMono, pendingStorageApplied, ownerWriting,
                 intentDurable, intentEverInFlight, survivorTookOver, intentDropped>>

RenewAmbiguous ==
  /\ renewInFlight
  /\ renewInFlight' = FALSE
  /\ storageExpiresAt' = IF pendingStorageApplied
                           THEN ExtendToAt(renewSentWall, storageExpiresAt)
                           ELSE storageExpiresAt
  /\ ownerBeliefExpiresAt' =
       IF WeakIgnoreAmbiguousDivergence
         THEN ExtendToAt(holderNow, ownerBeliefExpiresAt)
         ELSE ownerBeliefExpiresAt
  /\ UNCHANGED <<wallClock, holderNow, renewSentWall, renewSentMono,
                 pendingStorageApplied, ownerWriting, intentDurable,
                 intentEverInFlight, survivorTookOver, intentDropped>>

StorageExpired == storageExpiresAt <= wallClock
OwnerBelievesHolding == ownerBeliefExpiresAt > holderNow

UnsafeBeliefPastStorage ==
  WeakIgnoreAmbiguousDivergence
  \/ WeakStampAuthorityAtResponse
  \/ WeakHolderClockPaused

SurvivorTakeover ==
  /\ ~survivorTookOver
  /\ StorageExpired
  /\ survivorTookOver' = TRUE
  /\ intentDropped' =
       IF UnsafeBeliefPastStorage /\ ownerWriting /\ OwnerBelievesHolding
         THEN TRUE
         ELSE intentDropped
  /\ ownerWriting' = IF intentDropped' THEN FALSE ELSE ownerWriting
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 renewInFlight, renewSentWall, renewSentMono, pendingStorageApplied,
                 intentDurable, intentEverInFlight>>

OwnerFenceOnDivergence ==
  /\ ~WeakIgnoreAmbiguousDivergence
  /\ ~WeakStampAuthorityAtResponse
  /\ ~WeakHolderClockPaused
  /\ OwnerBelievesHolding
  /\ StorageExpired
  /\ ownerWriting
  /\ ~survivorTookOver
  /\ ownerWriting' = FALSE
  /\ UNCHANGED <<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
                 renewInFlight, renewSentWall, renewSentMono, pendingStorageApplied,
                 intentDurable, intentEverInFlight, survivorTookOver, intentDropped>>

-----------------------------------------------------------------------------
Next ==
  \/ TickBoth
  \/ TickPause
  \/ StartWrite
  \/ LandIntent
  \/ StartRenew
  \/ RenewApplied
  \/ RenewRejected
  \/ RenewAmbiguous
  \/ SurvivorTakeover
  \/ OwnerFenceOnDivergence

Spec == Init /\ [][Next]_<<wallClock, holderNow, storageExpiresAt, ownerBeliefExpiresAt,
  renewInFlight, renewSentWall, renewSentMono, pendingStorageApplied, ownerWriting,
  intentDurable, intentEverInFlight, survivorTookOver, intentDropped>>

-----------------------------------------------------------------------------
IntentPreserved ==
  ~(intentDropped /\ intentEverInFlight /\ ~intentDurable)

Safety == TypeOK /\ IntentPreserved

=============================================================================
