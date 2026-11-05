------------------------ MODULE HitlResumeIdempotency ------------------------
(***************************************************************************)
(* ClawQL HITL / Argo suspend-resume plane (not full Argo controller).     *)
(*                                                                         *)
(* running ⇄ suspended → terminal                                          *)
(* At most one CRD-mutating Resume per suspend episode; weak consecutive   *)
(* double-mutation COUNTEREXAMPLEs AtMostOneResumePerEpisode.              *)
(*                                                                         *)
(* Maps to: hitl-resume-transition.ts + suspend-resume.ts.                 *)
(***************************************************************************)

EXTENDS Naturals, TLC

CONSTANTS
  WeakDoubleResumeMutation,  \* BOOLEAN — TRUE = second mutating Resume
  MaxClock

VARIABLES
  status,                      \* running | suspended | terminal
  resumeMutationsThisEpisode,  \* resets on Suspend
  clock

TypeOK ==
  /\ status \in {"running", "suspended", "terminal"}
  /\ resumeMutationsThisEpisode \in Nat
  /\ clock \in 0..MaxClock

Init ==
  /\ status = "running"
  /\ resumeMutationsThisEpisode = 0
  /\ clock = 0

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<status, resumeMutationsThisEpisode>>

Suspend ==
  /\ status = "running"
  /\ status' = "suspended"
  /\ resumeMutationsThisEpisode' = 0
  /\ UNCHANGED clock

SuspendIdempotent ==
  /\ status = "suspended"
  /\ UNCHANGED <<status, clock, resumeMutationsThisEpisode>>

Resume ==
  /\ ~WeakDoubleResumeMutation
  /\ status = "suspended"
  /\ status' = "running"
  /\ resumeMutationsThisEpisode' = resumeMutationsThisEpisode + 1
  /\ UNCHANGED clock

ResumeIdempotent ==
  /\ status \in {"running", "terminal"}
  /\ UNCHANGED <<status, clock, resumeMutationsThisEpisode>>

Complete ==
  /\ status \in {"running", "suspended"}
  /\ status' = "terminal"
  /\ UNCHANGED <<clock, resumeMutationsThisEpisode>>

CompleteIdempotent ==
  /\ status = "terminal"
  /\ UNCHANGED <<status, clock, resumeMutationsThisEpisode>>

\* Weak: second CRD-mutating Resume while already running (webhook+NATS race).
WeakDoubleResume ==
  /\ WeakDoubleResumeMutation
  /\ status = "running"
  /\ resumeMutationsThisEpisode >= 1
  /\ resumeMutationsThisEpisode' = resumeMutationsThisEpisode + 1
  /\ UNCHANGED <<status, clock>>

WeakResumeFirst ==
  /\ WeakDoubleResumeMutation
  /\ status = "suspended"
  /\ status' = "running"
  /\ resumeMutationsThisEpisode' = resumeMutationsThisEpisode + 1
  /\ UNCHANGED clock

Next ==
  \/ Tick
  \/ Suspend
  \/ SuspendIdempotent
  \/ Resume
  \/ ResumeIdempotent
  \/ Complete
  \/ CompleteIdempotent
  \/ WeakDoubleResume
  \/ WeakResumeFirst

Spec == Init /\ [][Next]_<<status, resumeMutationsThisEpisode, clock>>

AtMostOneResumePerEpisode == resumeMutationsThisEpisode <= 1

Safety == TypeOK /\ AtMostOneResumePerEpisode

=============================================================================
