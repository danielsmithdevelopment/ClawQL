------------------------ MODULE AgentSubstrateSession ------------------------
(***************************************************************************)
(* Agent Substrate session lifecycle (ADR 0011 sandbox backend).           *)
(*                                                                         *)
(* none → running ⇄ suspended → terminated                                 *)
(* Terminate is terminal; weak rebirth-after-terminate COUNTEREXAMPLEs     *)
(* CreateAtMostOnce.                                                       *)
(*                                                                         *)
(* Maps to: agent-substrate-session-transition.ts + service.ts.            *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakRebirthAfterTerminate,  \* BOOLEAN — TRUE = recreate after terminated
  MaxClock

VARIABLES
  status,              \* none | running | suspended | terminated
  clock,
  createCount,         \* successful Create effects
  terminateCount

TypeOK ==
  /\ status \in {"none", "running", "suspended", "terminated"}
  /\ clock \in 0..MaxClock
  /\ createCount \in Nat
  /\ terminateCount \in Nat

Init ==
  /\ status = "none"
  /\ clock = 0
  /\ createCount = 0
  /\ terminateCount = 0

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, createCount, terminateCount>>

Create ==
  /\ status = "none"
  /\ status' = "running"
  /\ createCount' = createCount + 1
  /\ UNCHANGED <<clock, terminateCount>>

Suspend ==
  /\ status = "running"
  /\ status' = "suspended"
  /\ UNCHANGED <<clock, createCount, terminateCount>>

SuspendIdempotent ==
  /\ status = "suspended"
  /\ UNCHANGED <<status, clock, createCount, terminateCount>>

Resume ==
  /\ status = "suspended"
  /\ status' = "running"
  /\ UNCHANGED <<clock, createCount, terminateCount>>

ResumeIdempotent ==
  /\ status = "running"
  /\ UNCHANGED <<status, clock, createCount, terminateCount>>

Terminate ==
  /\ status \in {"running", "suspended"}
  /\ status' = "terminated"
  /\ terminateCount' = terminateCount + 1
  /\ UNCHANGED <<clock, createCount>>

TerminateIdempotent ==
  /\ status = "terminated"
  /\ UNCHANGED <<status, clock, createCount, terminateCount>>

\* Weak: treat terminated like absent and Create again (legacy mock quirk).
WeakRebirth ==
  /\ WeakRebirthAfterTerminate
  /\ status = "terminated"
  /\ status' = "running"
  /\ createCount' = createCount + 1
  /\ UNCHANGED <<clock, terminateCount>>

Next ==
  \/ Tick
  \/ Create
  \/ Suspend
  \/ SuspendIdempotent
  \/ Resume
  \/ ResumeIdempotent
  \/ Terminate
  \/ TerminateIdempotent
  \/ WeakRebirth

Spec == Init /\ [][Next]_<<status, clock, createCount, terminateCount>>

CreateAtMostOnce == createCount <= 1

Safety == TypeOK /\ CreateAtMostOnce

=============================================================================
