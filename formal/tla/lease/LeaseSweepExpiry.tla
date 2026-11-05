---------------------------- MODULE LeaseSweepExpiry ----------------------------
(***************************************************************************)
(* celld lease sweep vs wedged owner — expiry must not mean "dead".        *)
(*                                                                         *)
(* A same-host owner may be frozen (SIGSTOP) past published lease expiry   *)
(* with a durable intent not yet visible to a survivor sweep. Treating     *)
(* expiry as abandonment lets SweepRecoverOpenLog drop that intent and     *)
(* start a new generation — H2 / stale-incarnation through the sweep path. *)
(*                                                                         *)
(* WeakTreatExpiryAsDead = TRUE: buggy sweep (historical lab predicate).   *)
(* TLC must then violate IntentPreservedAfterSweep.                        *)
(*                                                                         *)
(* Target (FALSE): open-log recovery only when OwnerDead (process          *)
(* evidence). Expiry still enables FencedTakeover, which rejects late      *)
(* acks from the old generation without discarding the intent.             *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakTreatExpiryAsDead,  \* BOOLEAN — TRUE = buggy expiry-as-dead sweep
  MaxClock                \* small bound for TLC (e.g. 4)

VARIABLES
  clock,
  leaseExpiresAt,
  ownerFrozen,          \* SIGSTOP — process still live, cannot renew / finish write
  ownerDead,            \* process evidence (pid gone) — true dead
  intentDurable,        \* intent landed in open log / durable store
  intentInFlight,       \* write started; durable ack not yet visible to sweep
  intentEverInFlight,   \* sticky: a mid-flight write existed
  openLogRecovered,     \* survivor ran abandoned open-log recovery
  generation,           \* 1 = original owner gen; 2 = after abandoned recovery
  fenced,               \* takeover fenced old gen (CAS / epoch bump)
  lateAckAccepted       \* old gen ack after fence — must stay FALSE

TypeOK ==
  /\ clock \in 0..MaxClock
  /\ leaseExpiresAt \in 0..MaxClock
  /\ ownerFrozen \in BOOLEAN
  /\ ownerDead \in BOOLEAN
  /\ intentDurable \in BOOLEAN
  /\ intentInFlight \in BOOLEAN
  /\ intentEverInFlight \in BOOLEAN
  /\ openLogRecovered \in BOOLEAN
  /\ generation \in {1, 2}
  /\ fenced \in BOOLEAN
  /\ lateAckAccepted \in BOOLEAN

-----------------------------------------------------------------------------
Init ==
  /\ clock = 0
  /\ leaseExpiresAt = 2
  /\ ownerFrozen = FALSE
  /\ ownerDead = FALSE
  /\ intentDurable = FALSE
  /\ intentInFlight = FALSE
  /\ intentEverInFlight = FALSE
  /\ openLogRecovered = FALSE
  /\ generation = 1
  /\ fenced = FALSE
  /\ lateAckAccepted = FALSE

-----------------------------------------------------------------------------
\* Begin a write: intent is mid-flight (not yet durable to the open log).
StartWrite ==
  /\ ~ownerFrozen
  /\ ~ownerDead
  /\ ~intentInFlight
  /\ ~intentDurable
  /\ ~intentEverInFlight
  /\ generation = 1
  /\ intentInFlight' = TRUE
  /\ intentEverInFlight' = TRUE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentDurable,
                 openLogRecovered, generation, fenced, lateAckAccepted>>

\* Intent lands in durable open-log storage (normal path).
LandIntent ==
  /\ intentInFlight
  /\ ~intentDurable
  /\ ~openLogRecovered
  /\ intentDurable' = TRUE
  /\ intentInFlight' = FALSE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentEverInFlight,
                 openLogRecovered, generation, fenced, lateAckAccepted>>

\* Wedged: process frozen mid-write (still live — not dead).
FreezeOwner ==
  /\ ~ownerFrozen
  /\ ~ownerDead
  /\ intentInFlight
  /\ ownerFrozen' = TRUE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerDead, intentDurable, intentInFlight,
                 intentEverInFlight, openLogRecovered, generation, fenced, lateAckAccepted>>

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<leaseExpiresAt, ownerFrozen, ownerDead, intentDurable, intentInFlight,
                 intentEverInFlight, openLogRecovered, generation, fenced, lateAckAccepted>>

LeaseExpired == clock >= leaseExpiresAt

\* Process evidence: owner truly gone (not merely wedged).
ObserveOwnerDead ==
  /\ ownerFrozen \/ LeaseExpired
  /\ ~ownerDead
  /\ ownerDead' = TRUE
  /\ ownerFrozen' = FALSE
  /\ UNCHANGED <<clock, leaseExpiresAt, intentDurable, intentInFlight, intentEverInFlight,
                 openLogRecovered, generation, fenced, lateAckAccepted>>

\* Fenced takeover on expiry (or dead): epoch/CAS — does not drop intent.
FencedTakeover ==
  /\ ~fenced
  /\ (LeaseExpired \/ ownerDead)
  /\ fenced' = TRUE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentDurable,
                 intentInFlight, intentEverInFlight, openLogRecovered, generation,
                 lateAckAccepted>>

\* May abandon open log?
\* Target: only when ownerDead.
\* Weak: also when expired (historical lease_may_be_fenced_as_dead).
MayRecoverOpenLogAsDead ==
  \/ ownerDead
  \/ (WeakTreatExpiryAsDead /\ LeaseExpired)

\* Eager sweep recovers open log as abandoned — drops in-flight intent.
SweepRecoverOpenLog ==
  /\ ~openLogRecovered
  /\ MayRecoverOpenLogAsDead
  /\ (intentInFlight \/ intentDurable \/ intentEverInFlight)
  /\ openLogRecovered' = TRUE
  /\ generation' = 2
  /\ intentInFlight' = FALSE
  /\ intentDurable' = FALSE      \* lost — never seen by recovery
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentEverInFlight,
                 fenced, lateAckAccepted>>

\* Thaw: wedged owner resumes; may attempt a late ack.
ThawOwner ==
  /\ ownerFrozen
  /\ ~ownerDead
  /\ ownerFrozen' = FALSE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerDead, intentDurable, intentInFlight,
                 intentEverInFlight, openLogRecovered, generation, fenced, lateAckAccepted>>

\* Late ack from generation 1: accepted only if not yet fenced.
LateAck ==
  /\ ~ownerFrozen
  /\ ~ownerDead
  /\ generation = 1
  /\ IF fenced
     THEN UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentDurable,
                      intentInFlight, intentEverInFlight, openLogRecovered, generation,
                      fenced, lateAckAccepted>>
     ELSE /\ lateAckAccepted' = TRUE
          /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentDurable,
                         intentInFlight, intentEverInFlight, openLogRecovered, generation,
                         fenced>>

\* After thaw, mid-flight intent can still land if open log was not abandoned.
LandIntentAfterThaw ==
  /\ ~ownerFrozen
  /\ ~ownerDead
  /\ intentInFlight
  /\ ~openLogRecovered
  /\ intentDurable' = TRUE
  /\ intentInFlight' = FALSE
  /\ UNCHANGED <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentEverInFlight,
                 openLogRecovered, generation, fenced, lateAckAccepted>>

-----------------------------------------------------------------------------
Next ==
  \/ StartWrite
  \/ LandIntent
  \/ FreezeOwner
  \/ Tick
  \/ ObserveOwnerDead
  \/ FencedTakeover
  \/ SweepRecoverOpenLog
  \/ ThawOwner
  \/ LateAck
  \/ LandIntentAfterThaw

vars == <<clock, leaseExpiresAt, ownerFrozen, ownerDead, intentDurable, intentInFlight,
          intentEverInFlight, openLogRecovered, generation, fenced, lateAckAccepted>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
\* Safety: if a mid-flight intent existed and sweep abandoned the open log
\* while the owner was not process-dead, the intent must not be gone.
IntentPreservedAfterSweep ==
  ~(openLogRecovered /\ ~ownerDead /\ intentEverInFlight /\ ~intentDurable)

Safety == IntentPreservedAfterSweep

=============================================================================
