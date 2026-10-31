---------------------------- MODULE ProgramResume ----------------------------
(***************************************************************************)
(* ClawQL program resume — checkpointed-step durable execution (claim-path *)
(* §5), under bounds.                                                      *)
(*                                                                         *)
(* Models a single sequential program with MaxSteps steps. Each step is    *)
(* either a read (may re-request if crashed before a journal entry) or a   *)
(* write: journal intent → durable ack → host send → side effect → entry.  *)
(* Crash after durable intent → outcome_unknown, never silently retried.   *)
(*                                                                         *)
(* WeakAllowCompletedRerun = TRUE: buggy resume re-runs completed steps.   *)
(* WeakAllowSendWithoutDurableAck = TRUE: buggy host send before durable   *)
(* ack (must counterexample IntentDurablyAckedBeforeSend).                 *)
(*                                                                         *)
(* Claim to protect (bounded): crashed programs eventually complete under  *)
(* fair scheduling when no permanent unknown; completed steps never rerun; *)
(* write host send only after durable intent ack.                          *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  MaxSteps,                       \* small bound for TLC (e.g. 3)
  MaxCrashes,                     \* crash budget
  WriteSteps,                     \* SUBSET of Steps that append write intents
  WeakAllowCompletedRerun,        \* BOOLEAN — TRUE = buggy re-run of completed
  WeakAllowSendWithoutDurableAck  \* BOOLEAN — TRUE = buggy send before durable ack

VARIABLES
  pc,                 \* next step to attempt (1..MaxSteps+1)
  completed,          \* SUBSET Steps with a journal entry
  intent,             \* SUBSET WriteSteps with intent recorded (may be unacked)
  durableAcked,       \* SUBSET intent that has durable storage ack
  unknown,            \* SUBSET WriteSteps marked outcome_unknown (not re-run)
  runCount,           \* [step |-> Nat] host invocations (incl. re-requests)
  postCompleteRuns,   \* [step |-> Nat] begins after the step was journaled
  sideEffects,        \* [step |-> Nat] successful write effects
  status,             \* "running" | "parked" | "completed" | "outcome_unknown"
  crashes,            \* Nat
  midFlight           \* 0 = idle between steps; else step index in flight (send started)

Steps == 1..MaxSteps

TypeOK ==
  /\ pc \in 1..(MaxSteps + 1)
  /\ completed \subseteq Steps
  /\ intent \subseteq WriteSteps
  /\ durableAcked \subseteq intent
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
  /\ durableAcked = {}
  /\ unknown = {}
  /\ runCount = [s \in Steps |-> 0]
  /\ postCompleteRuns = [s \in Steps |-> 0]
  /\ sideEffects = [s \in Steps |-> 0]
  /\ status = "running"
  /\ crashes = 0
  /\ midFlight = 0

-----------------------------------------------------------------------------
CanStart(s) ==
  /\ status = "running"
  /\ midFlight = 0
  /\ pc = s
  /\ s \in Steps
  /\ s \notin unknown
  /\ WeakAllowCompletedRerun \/ s \notin completed

\* Journal write intent (storage.put issued — not yet durable-acked).
JournalWriteIntent(s) ==
  /\ CanStart(s)
  /\ s \in WriteSteps
  /\ s \notin intent
  /\ intent' = intent \cup {s}
  /\ UNCHANGED <<pc, completed, durableAcked, unknown, runCount, postCompleteRuns,
                 sideEffects, status, crashes, midFlight>>

\* Durable storage ack for a journaled intent.
\* "Acknowledged" means committed under the current lease epoch (LTX fenced
\* ack / host fsync) — NOT a same-node storage.get after put.
AckDurableIntent(s) ==
  /\ status = "running"
  /\ s \in intent
  /\ s \notin durableAcked
  /\ s \notin completed
  /\ s \notin unknown
  /\ durableAcked' = durableAcked \cup {s}
  /\ UNCHANGED <<pc, completed, intent, unknown, runCount, postCompleteRuns,
                 sideEffects, status, crashes, midFlight>>

\* Host send / begin in-flight call. Target: only after durable ack.
BeginWriteSend(s) ==
  /\ status = "running"
  /\ midFlight = 0
  /\ pc = s
  /\ s \in WriteSteps
  /\ s \in intent
  /\ s \notin completed
  /\ s \notin unknown
  /\ WeakAllowSendWithoutDurableAck \/ s \in durableAcked
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = IF s \in completed
                         THEN [postCompleteRuns EXCEPT ![s] = @ + 1]
                         ELSE postCompleteRuns
  /\ midFlight' = s
  /\ UNCHANGED <<pc, completed, intent, durableAcked, unknown, sideEffects, status, crashes>>

BeginRead(s) ==
  /\ CanStart(s)
  /\ s \notin WriteSteps
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = IF s \in completed
                         THEN [postCompleteRuns EXCEPT ![s] = @ + 1]
                         ELSE postCompleteRuns
  /\ midFlight' = s
  /\ UNCHANGED <<pc, completed, intent, durableAcked, unknown, sideEffects, status, crashes>>

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
  /\ durableAcked' = durableAcked \ {s}
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
  /\ UNCHANGED <<intent, durableAcked, unknown, runCount, postCompleteRuns, sideEffects, status, crashes>>

ReRunCompleted(s) ==
  /\ WeakAllowCompletedRerun
  /\ status = "running"
  /\ midFlight = 0
  /\ s \in completed
  /\ s \notin unknown
  /\ runCount' = [runCount EXCEPT ![s] = @ + 1]
  /\ postCompleteRuns' = [postCompleteRuns EXCEPT ![s] = @ + 1]
  /\ UNCHANGED <<pc, completed, intent, durableAcked, unknown, sideEffects, status, crashes, midFlight>>

\* Kill while host send in flight — durable intents survive into parked state.
CrashMid ==
  /\ status = "running"
  /\ midFlight # 0
  /\ crashes < MaxCrashes
  /\ status' = "parked"
  /\ crashes' = crashes + 1
  /\ midFlight' = 0
  /\ UNCHANGED <<pc, completed, intent, durableAcked, unknown, runCount, postCompleteRuns, sideEffects>>

\* Kill after journal put returns but before durable ack — unacked intent is lost
\* (models celld/R2 gap seen on during_call 404 settle).
CrashLoseUnacked ==
  /\ status = "running"
  /\ midFlight = 0
  /\ crashes < MaxCrashes
  /\ LET pending == intent \ durableAcked IN
       /\ pending # {}
       /\ intent' = intent \ pending
       /\ durableAcked' = durableAcked
       /\ status' = "parked"
       /\ crashes' = crashes + 1
  /\ UNCHANGED <<pc, completed, unknown, runCount, postCompleteRuns, sideEffects, midFlight>>

Resume ==
  /\ status = "parked"
  /\ LET openWrites == {s \in durableAcked : s \notin completed} IN
       /\ unknown' = unknown \cup openWrites
       /\ intent' = intent \ openWrites
       /\ durableAcked' = durableAcked \ openWrites
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
  /\ UNCHANGED <<pc, completed, intent, durableAcked, unknown, runCount, postCompleteRuns,
                 sideEffects, crashes, midFlight>>

Next ==
  \/ \E s \in Steps : JournalWriteIntent(s)
  \/ \E s \in Steps : AckDurableIntent(s)
  \/ \E s \in Steps : BeginWriteSend(s)
  \/ \E s \in Steps : BeginRead(s)
  \/ \E s \in Steps : CompleteWrite(s)
  \/ \E s \in Steps : CompleteRead(s)
  \/ \E s \in Steps : ReRunCompleted(s)
  \/ CrashMid
  \/ CrashLoseUnacked
  \/ Resume
  \/ FinishOk

vars == <<pc, completed, intent, durableAcked, unknown, runCount, postCompleteRuns,
          sideEffects, status, crashes, midFlight>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
NoCompletedStepRerun ==
  \A s \in Steps : postCompleteRuns[s] = 0

OutcomeUnknownHonest ==
  /\ \A s \in WriteSteps : sideEffects[s] <= 1
  /\ \A s \in unknown : s \notin intent /\ s \notin completed
  /\ status = "outcome_unknown" => unknown # {}
  /\ \A s \in unknown : sideEffects[s] = 0

WriteIntentBeforeEffect ==
  \A s \in WriteSteps :
    sideEffects[s] > 0 =>
      s \in completed \/ s \in unknown \/ s \in durableAcked \/ midFlight = s

\* Explicit: host send (midFlight write) only after durable ack.
IntentDurablyAckedBeforeSend ==
  \A s \in WriteSteps :
    midFlight = s => s \in durableAcked

Safety ==
  /\ TypeOK
  /\ NoCompletedStepRerun
  /\ OutcomeUnknownHonest
  /\ WriteIntentBeforeEffect
  /\ IntentDurablyAckedBeforeSend

EventualCompletion ==
  (crashes <= MaxCrashes /\ unknown = {}) ~> (status = "completed")

StateConstraint ==
  /\ crashes <= MaxCrashes
  /\ \A s \in Steps : runCount[s] <= 3
  /\ \A s \in Steps : postCompleteRuns[s] <= 2
  /\ \A s \in Steps : sideEffects[s] <= 2

=============================================================================
