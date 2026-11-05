--------------------------- MODULE McpHttpSession ---------------------------
(***************************************************************************)
(* Streamable HTTP MCP session membership + capacity (mcp-http-server).    *)
(*                                                                         *)
(* One distinguished sid: absent ⇄ present via Initialize / Close /        *)
(* IdleEvict. Touch only when present. activeCount tracks map size.        *)
(*                                                                         *)
(* WeakSkipCapacityCheck allows Initialize / OtherCreate past MaxSessions  *)
(* — COUNTEREXAMPLEs ActiveCountBounded.                                   *)
(*                                                                         *)
(* Maps to: mcp-http-session-transition.ts + mcp-session-idle.ts.          *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakSkipCapacityCheck,  \* BOOLEAN — TRUE = ignore MaxSessions
  MaxSessions,
  MaxClock

VARIABLES
  status,       \* absent | present  (distinguished session)
  activeCount,  \* |transports|
  clock

TypeOK ==
  /\ status \in {"absent", "present"}
  /\ activeCount \in Nat
  /\ clock \in 0..MaxClock

Init ==
  /\ status = "absent"
  /\ activeCount = 0
  /\ clock = 0

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, activeCount>>

UnderCapacity == WeakSkipCapacityCheck \/ activeCount < MaxSessions

Initialize ==
  /\ status = "absent"
  /\ UnderCapacity
  /\ status' = "present"
  /\ activeCount' = activeCount + 1
  /\ UNCHANGED clock

Touch ==
  /\ status = "present"
  /\ UNCHANGED <<status, activeCount, clock>>

Close ==
  /\ status = "present"
  /\ status' = "absent"
  /\ activeCount' = activeCount - 1
  /\ UNCHANGED clock

CloseIdempotent ==
  /\ status = "absent"
  /\ UNCHANGED <<status, activeCount, clock>>

IdleEvict ==
  /\ status = "present"
  /\ status' = "absent"
  /\ activeCount' = activeCount - 1
  /\ UNCHANGED clock

IdleEvictIdempotent ==
  /\ status = "absent"
  /\ UNCHANGED <<status, activeCount, clock>>

\* Other sessions filling the map (sid ≠ distinguished).
OtherCreate ==
  /\ UnderCapacity
  /\ activeCount' = activeCount + 1
  /\ UNCHANGED <<status, clock>>

OtherClose ==
  /\ activeCount > (IF status = "present" THEN 1 ELSE 0)
  /\ activeCount' = activeCount - 1
  /\ UNCHANGED <<status, clock>>

Next ==
  \/ Tick
  \/ Initialize
  \/ Touch
  \/ Close
  \/ CloseIdempotent
  \/ IdleEvict
  \/ IdleEvictIdempotent
  \/ OtherCreate
  \/ OtherClose

Spec == Init /\ [][Next]_<<status, activeCount, clock>>

ActiveCountBounded == activeCount <= MaxSessions

\* Distinguished sid present ⇒ counted in activeCount.
PresentCounted == status = "absent" \/ activeCount >= 1

Safety == TypeOK /\ ActiveCountBounded /\ PresentCounted

=============================================================================
