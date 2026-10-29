---------------------------- MODULE ProgramResume ----------------------------
(***************************************************************************)
(* ClawQL program resume — checkpointed-step durable execution (claim-path *)
(* §5), under bounds.                                                      *)
(*                                                                         *)
(* Models a single sequential program with MaxSteps steps. Each step is    *)
(* either a read (may re-request if crashed before a journal entry) or a   *)
(* write (intent then side effect then entry; crash after intent →         *)
(* outcome_unknown, never silently retried).                               *)
(*                                                                         *)
(* WeakAllowCompletedRerun = FALSE (target): never re-invoke a step that   *)
(* already has a journal entry.                                            *)
(* WeakAllowCompletedRerun = TRUE: buggy resume re-runs completed steps    *)
(* (must counterexample NoCompletedStepRerun / Safety).                    *)
(*                                                                         *)
(* Claim to protect (bounded): crashed programs eventually complete under  *)
(* fair scheduling when no permanent unknown; completed steps never rerun. *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  MaxSteps,                  \* small bound for TLC (e.g. 3)
  MaxCrashes,                \* crash budget
  WriteSteps,                \* SUBSET of Steps that append write intents
  WeakAllowCompletedRerun    \* BOOLEAN — TRUE = buggy re-run of completed

VARIABLES
  pc,                 \* next step to attempt (1..MaxSteps+1)
  completed,          \* SUBSET Steps with a journal entry
  intent,             \* SUBSET WriteSteps with intent and no entry yet
  unknown,            \* SUBSET WriteSteps marked outcome_unknown (not re-run)
  runCount,           \* [step |-> Nat] host invocations (incl. re-requests)
  postCompleteRuns,   \* [step |-> Nat] begins after the step was journaled
  sideEffects,        \* [step |-> Nat] successful write effects
  status,             \* "running" | "parked" | "completed" | "outcome_unknown"
  crashes,            \* Nat
  midFlight           \* 0 = idle between steps; else step index in flight

Steps == 1..MaxSteps

TypeOK ==
  /\ pc \in 1..(MaxSteps + 1)
  /\ completed \subseteq Steps
  /\ intent \subseteq WriteSteps
  /\ unknown \subseteq WriteSteps
  /\ runCount \in [Steps -> Nat]
  /\ postCompleteRuns \in [Steps -> Nat]
  /\ sideEffects \in [Steps -> Nat]
  /\ status \in {"running", "parked", "completed", "outcome_unknown"}
  /\ crashes \in 0..MaxCrashes
  /\ midFlight \in 0..MaxSteps

-----------------------------------------------------------------------------
Init ==
  /\ pc = 1
  /\ completed = {}
  /\ intent = {}
  /\ unknown = {}
  /\ runCount = [s \in Steps |-> 0]
  /\ postCompleteRuns = [s \in Steps |-> 0]
  /\ sideEffects = [s \in Steps |-> 0]
  /\ status = "running"
  /\ crashes = 0
  /\ midFlight = 0

-----------------------------------------------------------------------------
\* Begin a step that is not yet journaled (or, when weak, even if it is).
CanStart(s) ==
  /\ status = "running"
  /\ midFlight = 0
  /\ pc = s
  /\ s \in Steps
  /\ s \notin unknown
  /\ WeakAllowCompletedRerun \/ s \notin completed

BeginWrite(s) ==
  /\ CanStart(s)
  /\ s \in WriteSteps
  /\ intent' = intent \cup {s}
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = IF s \in completed
                         THEN [postCompleteRuns EXCEPT ![s] = @ + 1]
                         ELSE postCompleteRuns
  /\ midFlight' = s
  /\ UNCHANGED <<pc, completed, unknown, sideEffects, status, crashes>>

BeginRead(s) ==
  /\ CanStart(s)
  /\ s \notin WriteSteps
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = IF s \in completed
                         THEN [postCompleteRuns EXCEPT ![s] = @ + 1]
                         ELSE postCompleteRuns
  /\ midFlight' = s
  /\ UNCHANGED <<pc, completed, intent, unknown, sideEffects, status, crashes>>

CompleteWrite(s) ==
  /\ status = "running"
  /\ midFlight = s
  /\ s \in WriteSteps
  /\ s \in intent
  /\ s \notin completed
  /\ s \notin unknown
  /\ sideEffects' = [sideEffects EXCEPT ![s] = @ + 1]
  /\ completed' = completed \cup {s}
  /\ intent' = intent \ {s}
  /\ midFlight' = 0
  /\ pc' = s + 1
  /\ UNCHANGED <<unknown, runCount, postCompleteRuns, status, crashes>>

CompleteRead(s) ==
  /\ status = "running"
  /\ midFlight = s
  /\ s \notin WriteSteps
  /\ s \notin completed
  /\ completed' = completed \cup {s}
  /\ midFlight' = 0
  /\ pc' = s + 1
  /\ UNCHANGED <<intent, unknown, runCount, postCompleteRuns, sideEffects, status, crashes>>

\* Buggy weak path: re-invoke a journaled step even though pc has moved on
\* (proves NoCompletedStepRerun has teeth). Does not require pc = s.
ReRunCompleted(s) ==
  /\ WeakAllowCompletedRerun
  /\ status = "running"
  /\ midFlight = 0
  /\ s \in completed
  /\ s \notin unknown
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = [postCompleteRuns EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<pc, completed, intent, unknown, sideEffects, status, crashes, midFlight>>

CrashMid ==
  /\ status = "running"
  /\ midFlight # 0
  /\ crashes < MaxCrashes
  /\ status' = "parked"
  /\ crashes' = crashes + 1
  /\ midFlight' = 0
  /\ UNCHANGED <<pc, completed, intent, unknown, runCount, postCompleteRuns, sideEffects>>

\* Resume: write intents without entries become outcome_unknown (not re-run);
\* advance pc past those writes. Reads without entries stay at pc (re-request).
\* Matches durable-runner: land outcome_unknown and continue later steps.
Resume ==
  /\ status = "parked"
  /\ LET openWrites == {s \in intent : s \notin completed} IN
       /\ unknown' = unknown \cup openWrites
       /\ intent' = intent \ openWrites
       /\ pc' = IF pc \in openWrites THEN pc + 1 ELSE pc
       /\ status' = "running"
  /\ midFlight' = 0
  /\ UNCHANGED <<completed, runCount, postCompleteRuns, sideEffects, crashes>>

FinishOk ==
  /\ status = "running"
  /\ midFlight = 0
  /\ pc = MaxSteps + 1
  /\ completed \cup unknown = Steps
  /\ status' = IF unknown = {} THEN "completed" ELSE "outcome_unknown"
  /\ UNCHANGED <<pc, completed, intent, unknown, runCount, postCompleteRuns,
                 sideEffects, crashes, midFlight>>

Next ==
  \/ \E s \in Steps : BeginWrite(s)
  \/ \E s \in Steps : BeginRead(s)
  \/ \E s \in Steps : CompleteWrite(s)
  \/ \E s \in Steps : CompleteRead(s)
  \/ \E s \in Steps : ReRunCompleted(s)
  \/ CrashMid
  \/ Resume
  \/ FinishOk

vars == <<pc, completed, intent, unknown, runCount, postCompleteRuns,
          sideEffects, status, crashes, midFlight>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
\* --- Safety ---

\* A journaled step must never be host-invoked again.
NoCompletedStepRerun ==
  \A s \in Steps : postCompleteRuns[s] = 0

\* Writes never silently retry after crash-with-intent: at most one side effect,
\* and an open intent after park is drained into unknown (Resume), not completed.
OutcomeUnknownHonest ==
  /\ \A s \in WriteSteps : sideEffects[s] <= 1
  /\ \A s \in unknown : s \notin intent /\ s \notin completed
  /\ status = "outcome_unknown" => unknown # {}
  /\ \A s \in unknown : sideEffects[s] = 0

\* Writes only take effect after an intent (no phantom side effects).
WriteIntentBeforeEffect ==
  \A s \in WriteSteps :
    sideEffects[s] > 0 =>
      s \in completed \/ s \in unknown \/ s \in intent \/ midFlight = s

Safety ==
  /\ TypeOK
  /\ NoCompletedStepRerun
  /\ OutcomeUnknownHonest
  /\ WriteIntentBeforeEffect

\* --- Liveness (optional / large under TLC) ---
EventualCompletion ==
  (crashes <= MaxCrashes /\ unknown = {}) ~> (status = "completed")

StateConstraint ==
  /\ crashes <= MaxCrashes
  /\ \A s \in Steps : runCount[s] <= 3
  /\ \A s \in Steps : postCompleteRuns[s] <= 2
  /\ \A s \in Steps : sideEffects[s] <= 2

=============================================================================
