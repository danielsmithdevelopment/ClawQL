------------------------ MODULE PaymentsHoldCompensation ------------------------
(***************************************************************************)
(* ClawQL payments — credit holds + compensation (HITL 2PC) crash model.   *)
(*                                                                         *)
(* Coverage note: clawql-payments mutates its own file-backed stores. It   *)
(* does NOT go through mandate consume (PendingExecution) or the program   *)
(* write-intent journal. Crash-safety for money therefore needs this       *)
(* protocol model (and ledger/compensation idempotency), not Mandate/      *)
(* ProgramResume alone. See formal/tla/payments/README.md.                 *)
(*                                                                         *)
(* Holds:    none → held → captured | released                             *)
(* Actions:  none → pending → executed | cancelled | expired               *)
(*                                                                         *)
(* Target: status flip and side-effect count update are atomic.            *)
(* WeakAtomicity = TRUE: side effect while status still held/pending —     *)
(* TLC must then violate AtMostOneCapture / AtMostOneCompensationExecute.  *)
(***************************************************************************)

EXTENDS Naturals, Sequences, TLC

CONSTANTS
  MaxHolds,          \* max hold ids
  MaxActions,        \* max compensation action ids
  WeakAtomicity      \* BOOLEAN — TRUE = legacy non-atomic settle / confirm

VARIABLES
  holds,             \* [hid |-> HoldStatuses]
  captures,          \* [hid |-> Nat] capture side effects applied
  releases,          \* [hid |-> Nat] release side effects applied
  actions,           \* [aid |-> ActionStatuses]
  executes,          \* [aid |-> Nat] compensation execute side effects
  nextHid,
  nextAid,
  clock

Hid == 1..MaxHolds
Aid == 1..MaxActions

HoldStatuses == {"none", "held", "captured", "released"}
ActionStatuses == {"none", "pending", "executed", "cancelled", "expired"}

TypeOK ==
  /\ nextHid \in 1..(MaxHolds + 1)
  /\ nextAid \in 1..(MaxActions + 1)
  /\ clock \in Nat
  /\ holds \in [Hid -> HoldStatuses]
  /\ captures \in [Hid -> Nat]
  /\ releases \in [Hid -> Nat]
  /\ actions \in [Aid -> ActionStatuses]
  /\ executes \in [Aid -> Nat]

-----------------------------------------------------------------------------
Init ==
  /\ holds = [h \in Hid |-> "none"]
  /\ captures = [h \in Hid |-> 0]
  /\ releases = [h \in Hid |-> 0]
  /\ actions = [a \in Aid |-> "none"]
  /\ executes = [a \in Aid |-> 0]
  /\ nextHid = 1
  /\ nextAid = 1
  /\ clock = 0

-----------------------------------------------------------------------------
\* Create a hold (reserve). Idempotent create is out of scope — new id each time.
HoldCreate ==
  /\ nextHid <= MaxHolds
  /\ LET h == nextHid IN
       /\ holds' = [holds EXCEPT ![h] = "held"]
       /\ nextHid' = nextHid + 1
  /\ UNCHANGED <<captures, releases, actions, executes, nextAid, clock>>

\* Target: capture under lock flips held → captured and records one effect.
CaptureAtomic(h) ==
  /\ ~WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ holds' = [holds EXCEPT ![h] = "captured"]
  /\ captures' = [captures EXCEPT ![h] = @ + 1]
  /\ UNCHANGED <<releases, actions, executes, nextHid, nextAid, clock>>

\* Idempotent re-capture of already-captured hold (no second effect).
CaptureIdempotent(h) ==
  /\ ~WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "captured"
  /\ UNCHANGED <<holds, captures, releases, actions, executes, nextHid, nextAid, clock>>

ReleaseAtomic(h) ==
  /\ ~WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ holds' = [holds EXCEPT ![h] = "released"]
  /\ releases' = [releases EXCEPT ![h] = @ + 1]
  /\ UNCHANGED <<captures, actions, executes, nextHid, nextAid, clock>>

ReleaseIdempotent(h) ==
  /\ ~WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "released"
  /\ UNCHANGED <<holds, captures, releases, actions, executes, nextHid, nextAid, clock>>

\* Weak: apply capture effect while still "held" (crash before status write).
WeakCapture(h) ==
  /\ WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ captures' = [captures EXCEPT ![h] = @ + 1]
  /\ UNCHANGED <<holds, releases, actions, executes, nextHid, nextAid, clock>>

WeakMarkCaptured(h) ==
  /\ WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ holds' = [holds EXCEPT ![h] = "captured"]
  /\ UNCHANGED <<captures, releases, actions, executes, nextHid, nextAid, clock>>

WeakRelease(h) ==
  /\ WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ releases' = [releases EXCEPT ![h] = @ + 1]
  /\ UNCHANGED <<holds, captures, actions, executes, nextHid, nextAid, clock>>

WeakMarkReleased(h) ==
  /\ WeakAtomicity
  /\ h \in Hid
  /\ holds[h] = "held"
  /\ holds' = [holds EXCEPT ![h] = "released"]
  /\ UNCHANGED <<captures, releases, actions, executes, nextHid, nextAid, clock>>

-----------------------------------------------------------------------------
StageAction ==
  /\ nextAid <= MaxActions
  /\ LET a == nextAid IN
       /\ actions' = [actions EXCEPT ![a] = "pending"]
       /\ nextAid' = nextAid + 1
  /\ UNCHANGED <<holds, captures, releases, executes, nextHid, clock>>

ConfirmAtomic(a) ==
  /\ ~WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "pending"
  /\ actions' = [actions EXCEPT ![a] = "executed"]
  /\ executes' = [executes EXCEPT ![a] = @ + 1]
  /\ UNCHANGED <<holds, captures, releases, nextHid, nextAid, clock>>

\* Re-confirm after executed — no second side effect (bounty / transfer).
ConfirmIdempotent(a) ==
  /\ ~WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "executed"
  /\ UNCHANGED <<holds, captures, releases, actions, executes, nextHid, nextAid, clock>>

CancelAtomic(a) ==
  /\ ~WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "pending"
  /\ actions' = [actions EXCEPT ![a] = "cancelled"]
  /\ UNCHANGED <<holds, captures, releases, executes, nextHid, nextAid, clock>>

ExpireAtomic(a) ==
  /\ ~WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "pending"
  /\ actions' = [actions EXCEPT ![a] = "expired"]
  /\ UNCHANGED <<holds, captures, releases, executes, nextHid, nextAid, clock>>

WeakConfirm(a) ==
  /\ WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "pending"
  /\ executes' = [executes EXCEPT ![a] = @ + 1]
  /\ UNCHANGED <<holds, captures, releases, actions, nextHid, nextAid, clock>>

WeakMarkExecuted(a) ==
  /\ WeakAtomicity
  /\ a \in Aid
  /\ actions[a] = "pending"
  /\ actions' = [actions EXCEPT ![a] = "executed"]
  /\ UNCHANGED <<holds, captures, releases, executes, nextHid, nextAid, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<holds, captures, releases, actions, executes, nextHid, nextAid>>

-----------------------------------------------------------------------------
Next ==
  \/ HoldCreate
  \/ \E h \in Hid : CaptureAtomic(h)
  \/ \E h \in Hid : CaptureIdempotent(h)
  \/ \E h \in Hid : ReleaseAtomic(h)
  \/ \E h \in Hid : ReleaseIdempotent(h)
  \/ \E h \in Hid : WeakCapture(h)
  \/ \E h \in Hid : WeakMarkCaptured(h)
  \/ \E h \in Hid : WeakRelease(h)
  \/ \E h \in Hid : WeakMarkReleased(h)
  \/ StageAction
  \/ \E a \in Aid : ConfirmAtomic(a)
  \/ \E a \in Aid : ConfirmIdempotent(a)
  \/ \E a \in Aid : CancelAtomic(a)
  \/ \E a \in Aid : ExpireAtomic(a)
  \/ \E a \in Aid : WeakConfirm(a)
  \/ \E a \in Aid : WeakMarkExecuted(a)
  \/ Tick

vars == <<holds, captures, releases, actions, executes, nextHid, nextAid, clock>>

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
AtMostOneCapture ==
  \A h \in Hid : captures[h] <= 1

AtMostOneRelease ==
  \A h \in Hid : releases[h] <= 1

\* A hold is never both captured and released with effects.
HoldExclusiveSettle ==
  \A h \in Hid : ~(captures[h] > 0 /\ releases[h] > 0)

AtMostOneCompensationExecute ==
  \A a \in Aid : executes[a] <= 1

\* Status mirrors effects under the atomic path; weak may diverge temporarily.
\* Safety always: executed implies ≥1 execute only when atomic; under weak we
\* still require ≤1 (the property weak is meant to break).
ExecutedImpliesEffect ==
  \A a \in Aid :
    actions[a] = "executed" => executes[a] >= 1 \/ WeakAtomicity

CapturedImpliesEffect ==
  \A h \in Hid :
    holds[h] = "captured" => captures[h] >= 1 \/ WeakAtomicity

Safety ==
  /\ TypeOK
  /\ AtMostOneCapture
  /\ AtMostOneRelease
  /\ HoldExclusiveSettle
  /\ AtMostOneCompensationExecute

StateConstraint ==
  /\ clock <= 4
  /\ nextHid <= MaxHolds + 1
  /\ nextAid <= MaxActions + 1

=============================================================================
