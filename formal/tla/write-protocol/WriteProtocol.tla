---------------------------- MODULE WriteProtocol ----------------------------
(***************************************************************************)
(* ClawQL crash-during-outside-write protocol — model-checked design.      *)
(*                                                                         *)
(* Parties that may misbehave / interleave:                                *)
(*   - Agent: may retry whenever it likes after interrupt                  *)
(*   - ClawQL node: crash at any step; journal survives                    *)
(*   - Network: request may stay in flight (delayed apply)                 *)
(*   - Remote server: applies each request it receives; API type varies    *)
(*                                                                         *)
(* ApiType:                                                                *)
(*   "keys"   — idempotency keys honored                                   *)
(*   "lookup" — exact lookup-by-reference                                  *)
(*   "neither"— no keys, no lookup                                         *)
(*                                                                         *)
(* WeakEarlyNotFound = TRUE models trusting "not found" while a request    *)
(* may still land. TLC must then violate NoDuplicateEffect / NoUnsafeRetry.*)
(*                                                                         *)
(* Claim style: model-checked under stated bounds — not "provably correct".*)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  MaxWrites,              \* logical writes to attempt (small for TLC)
  ApiType,                \* "keys" | "lookup" | "neither"
  WeakEarlyNotFound,      \* TRUE = trust not_found while request may still land
  AllowBlindAgentRetry    \* TRUE = peer/agent re-sends without a structural gate

ASSUME ApiType \in {"keys", "lookup", "neither"}
ASSUME WeakEarlyNotFound \in BOOLEAN
ASSUME AllowBlindAgentRetry \in BOOLEAN

VARIABLES
  nextWrite,           \* next logical write id
  journal,             \* [wid |-> journal record]
  inflight,            \* set of write ids accepted but not yet applied
  applied,             \* [wid |-> Nat] how many times the server applied wid
  clawqlDone,          \* [wid |-> {"none","done","unknown","not_done"}]
  crashed,             \* BOOLEAN — node currently down
  clock

WriteId == 1..MaxWrites

JournalRecord == [
  status: {"none", "intent", "reconciled", "outcome_unknown"},
  reference: WriteId \cup {0}
]

TypeOK ==
  /\ nextWrite \in 1..(MaxWrites + 1)
  /\ clock \in Nat
  /\ crashed \in BOOLEAN
  /\ inflight \subseteq WriteId
  /\ applied \in [WriteId -> Nat]
  /\ clawqlDone \in [WriteId -> {"none", "done", "unknown", "not_done"}]
  /\ journal \in [WriteId -> JournalRecord]

-----------------------------------------------------------------------------
Init ==
  /\ nextWrite = 1
  /\ journal = [w \in WriteId |-> [status |-> "none", reference |-> 0]]
  /\ inflight = {}
  /\ applied = [w \in WriteId |-> 0]
  /\ clawqlDone = [w \in WriteId |-> "none"]
  /\ crashed = FALSE
  /\ clock = 0

-----------------------------------------------------------------------------
\* Start a write: journal intent, send request (may stay in flight).
SendWrite ==
  /\ ~crashed
  /\ nextWrite <= MaxWrites
  /\ LET w == nextWrite IN
       /\ journal[w].status = "none"
       /\ journal' = [journal EXCEPT ![w] = [status |-> "intent", reference |-> w]]
       /\ inflight' = inflight \cup {w}
       /\ nextWrite' = nextWrite + 1
  /\ UNCHANGED <<applied, clawqlDone, crashed, clock>>

\* Network/server eventually applies an in-flight request.
ApplyInflight(w) ==
  /\ w \in inflight
  /\ inflight' = inflight \ {w}
  /\ IF ApiType = "keys" /\ applied[w] >= 1
       THEN applied' = applied          \* key dedupe
       ELSE applied' = [applied EXCEPT ![w] = @ + 1]
  /\ UNCHANGED <<nextWrite, journal, clawqlDone, crashed, clock>>

\* Crash: node down; in-flight requests may still apply later.
Crash ==
  /\ ~crashed
  /\ crashed' = TRUE
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, clawqlDone>>

\* Resume node.
Resume ==
  /\ crashed
  /\ crashed' = FALSE
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, clawqlDone, clock>>

\* Lookup-capable reconcile when the effect is already applied.
LookupFound(w) ==
  /\ ~crashed
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] >= 1
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, applied, crashed, clock>>

\* Keyed redrive after crash (idempotent API).
KeyedRedrive(w) ==
  /\ ~crashed
  /\ ApiType = "keys"
  /\ journal[w].status = "intent"
  /\ applied' = IF applied[w] = 0 THEN [applied EXCEPT ![w] = 1] ELSE applied
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, crashed, clock>>

\* Safe path: not_found only definitive when nothing in flight for w.
LookupNotFoundSafe(w) ==
  /\ ~crashed
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] = 0
  /\ w \notin inflight          \* original can no longer land
  /\ ~WeakEarlyNotFound
  /\ applied' = [applied EXCEPT ![w] = 1]   \* one safe resend
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, crashed, clock>>

\* Weak path: trust not_found while still in flight (UNSAFE — for counterexample).
LookupNotFoundWeak(w) ==
  /\ ~crashed
  /\ WeakEarlyNotFound
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] = 0
  /\ w \in inflight             \* still may land
  /\ applied' = [applied EXCEPT ![w] = @ + 1]  \* unsafe "resend"
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, crashed, clock>>

\* Neither keys nor lookup (or ambiguous lookup): stay unknown; never resend.
MarkUnknown(w) ==
  /\ ~crashed
  /\ journal[w].status = "intent"
  /\ \/ ApiType = "neither"
     \/ /\ ApiType = "lookup"
        /\ applied[w] = 0
        /\ w \in inflight
        /\ ~WeakEarlyNotFound
  /\ journal' = [journal EXCEPT ![w] =
       [status |-> "outcome_unknown", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "unknown"]
  /\ UNCHANGED <<nextWrite, inflight, applied, crashed, clock>>

\* Agent always-retries without a structural gate (Pi/Golem out-of-the-box on
\* ApiType=neither). ClawQL atomic configs set AllowBlindAgentRetry = FALSE.
AgentBlindRetry(w) ==
  /\ AllowBlindAgentRetry
  /\ ~crashed
  /\ ApiType = "neither"
  /\ journal[w].status \in {"intent", "outcome_unknown"}
  /\ applied' = [applied EXCEPT ![w] = @ + 1]
  /\ UNCHANGED <<nextWrite, journal, inflight, clawqlDone, crashed, clock>>

\* ClawQL structural refusal: agent wants to retry; applied unchanged.
AgentRetryRefused(w) ==
  /\ ~AllowBlindAgentRetry
  /\ ~crashed
  /\ journal[w].status \in {"intent", "outcome_unknown"}
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, clawqlDone, crashed, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, clawqlDone, crashed>>

-----------------------------------------------------------------------------
Next ==
  \/ SendWrite
  \/ \E w \in WriteId: ApplyInflight(w)
  \/ Crash
  \/ Resume
  \/ \E w \in WriteId: LookupFound(w)
  \/ \E w \in WriteId: KeyedRedrive(w)
  \/ \E w \in WriteId: LookupNotFoundSafe(w)
  \/ \E w \in WriteId: LookupNotFoundWeak(w)
  \/ \E w \in WriteId: MarkUnknown(w)
  \/ \E w \in WriteId: AgentBlindRetry(w)
  \/ \E w \in WriteId: AgentRetryRefused(w)
  \/ Tick

Spec == Init /\ [][Next]_<<nextWrite, journal, inflight, applied, clawqlDone, crashed, clock>>

-----------------------------------------------------------------------------
\* Properties (safety — model-checked under cfg bounds)

NoDuplicateEffect ==
  \A w \in WriteId: applied[w] <= 1

NoFalseDone ==
  \A w \in WriteId:
    clawqlDone[w] = "done" => applied[w] >= 1

\* Resend/reconcile-as-done only when not still in flight (unless Weak).
NoUnsafeRetry ==
  ~WeakEarlyNotFound =>
    \A w \in WriteId:
      journal[w].status = "reconciled" => w \notin inflight \/ applied[w] >= 1

\* Unknown is the honest floor when we cannot finish: neither keys, or lookup
\* still ambiguous at decide time (original may apply later — still not "done").
UnknownOnlyWhenStuck ==
  \A w \in WriteId:
    clawqlDone[w] = "unknown" =>
      ApiType \in {"neither", "lookup"}

Safety ==
  /\ NoDuplicateEffect
  /\ NoFalseDone
  /\ NoUnsafeRetry

\* Eventual resolution under fairness is checked separately if needed;
\* for TLC we keep a bounded safety focus.

StateConstraint == clock <= 5

=============================================================================
