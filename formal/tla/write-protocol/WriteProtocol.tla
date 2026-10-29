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
(* "Can no longer land" is NOT a client timeout. It is an explicit         *)
(* ServerGuarantee with a named reason the remote service actually offers: *)
(*   "server_enforced_expiry"     — signed max-age the server rejects      *)
(*   "lookup_covers_prior_accepts"— API docs: lookup sees all prior accepts*)
(*   "connection_rejected"        — connection-level reject (not silence)  *)
(* Client-side give-up alone never enters canNoLongerLand.                 *)
(*                                                                         *)
(* WeakEarlyNotFound = TRUE trusts not_found without a ServerGuarantee.    *)
(* TLC must then violate NoDuplicateEffect / NoUnsafeRetry.                *)
(*                                                                         *)
(* Claim style: model-checked under stated bounds — not "provably correct".*)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  MaxWrites,              \* logical writes to attempt (small for TLC)
  ApiType,                \* "keys" | "lookup" | "neither"
  WeakEarlyNotFound,      \* TRUE = trust not_found without ServerGuarantee
  AllowBlindAgentRetry    \* TRUE = peer/agent re-sends without a structural gate

ASSUME ApiType \in {"keys", "lookup", "neither"}
ASSUME WeakEarlyNotFound \in BOOLEAN
ASSUME AllowBlindAgentRetry \in BOOLEAN

GuaranteeReasons == {
  "server_enforced_expiry",
  "lookup_covers_prior_accepts",
  "connection_rejected"
}

VARIABLES
  nextWrite,           \* next logical write id
  journal,             \* [wid |-> journal record]
  inflight,            \* set of write ids accepted but not yet applied
  applied,             \* [wid |-> Nat] how many times the server applied wid
  canNoLongerLand,     \* set of wids for which a ServerGuarantee was recorded
  guaranteeReason,     \* [wid |-> reason or "none"]
  clawqlDone,          \* [wid |-> {"none","done","unknown","not_done"}]
  crashed,             \* BOOLEAN — node currently down
  clock

WriteId == 1..MaxWrites

JournalRecord == [
  status: {"none", "intent", "reconciled", "outcome_unknown"},
  reference: WriteId \cup {0}
]

vars == <<nextWrite, journal, inflight, applied, canNoLongerLand,
          guaranteeReason, clawqlDone, crashed, clock>>

TypeOK ==
  /\ nextWrite \in 1..(MaxWrites + 1)
  /\ clock \in Nat
  /\ crashed \in BOOLEAN
  /\ inflight \subseteq WriteId
  /\ canNoLongerLand \subseteq WriteId
  /\ applied \in [WriteId -> Nat]
  /\ clawqlDone \in [WriteId -> {"none", "done", "unknown", "not_done"}]
  /\ journal \in [WriteId -> JournalRecord]
  /\ guaranteeReason \in [WriteId -> (GuaranteeReasons \cup {"none"})]

-----------------------------------------------------------------------------
Init ==
  /\ nextWrite = 1
  /\ journal = [w \in WriteId |-> [status |-> "none", reference |-> 0]]
  /\ inflight = {}
  /\ applied = [w \in WriteId |-> 0]
  /\ canNoLongerLand = {}
  /\ guaranteeReason = [w \in WriteId |-> "none"]
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
  /\ UNCHANGED <<applied, canNoLongerLand, guaranteeReason, clawqlDone, crashed, clock>>

\* Network/server eventually applies an in-flight request (may be after client gave up).
ApplyInflight(w) ==
  /\ w \in inflight
  /\ w \notin canNoLongerLand   \* server-enforced expiry already rejected it
  /\ inflight' = inflight \ {w}
  /\ IF ApiType = "keys" /\ applied[w] >= 1
       THEN applied' = applied
       ELSE applied' = [applied EXCEPT ![w] = @ + 1]
  /\ UNCHANGED <<nextWrite, journal, canNoLongerLand, guaranteeReason,
                 clawqlDone, crashed, clock>>

\* Named server guarantee: the original can no longer take effect.
\* Drop from inflight (server will not apply) and record the reason.
ServerGuarantee(w, reason) ==
  /\ reason \in GuaranteeReasons
  /\ journal[w].status = "intent"
  /\ w \notin canNoLongerLand
  /\ canNoLongerLand' = canNoLongerLand \cup {w}
  /\ guaranteeReason' = [guaranteeReason EXCEPT ![w] = reason]
  /\ inflight' = inflight \ {w}
  /\ UNCHANGED <<nextWrite, journal, applied, clawqlDone, crashed, clock>>

\* Crash: node down; in-flight requests may still apply later unless guaranteed.
Crash ==
  /\ ~crashed
  /\ crashed' = TRUE
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, canNoLongerLand,
                 guaranteeReason, clawqlDone>>

Resume ==
  /\ crashed
  /\ crashed' = FALSE
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, canNoLongerLand,
                 guaranteeReason, clawqlDone, clock>>

LookupFound(w) ==
  /\ ~crashed
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] >= 1
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, applied, canNoLongerLand, guaranteeReason,
                 crashed, clock>>

KeyedRedrive(w) ==
  /\ ~crashed
  /\ ApiType = "keys"
  /\ journal[w].status = "intent"
  /\ applied' = IF applied[w] = 0 THEN [applied EXCEPT ![w] = 1] ELSE applied
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, canNoLongerLand, guaranteeReason, crashed, clock>>

\* Safe path: not_found + named ServerGuarantee → one safe resend.
LookupNotFoundSafe(w) ==
  /\ ~crashed
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] = 0
  /\ w \in canNoLongerLand      \* MUST name a real server guarantee
  /\ ~WeakEarlyNotFound
  /\ applied' = [applied EXCEPT ![w] = 1]
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, canNoLongerLand, guaranteeReason, crashed, clock>>

\* Weak path: trust not_found WITHOUT a ServerGuarantee (UNSAFE).
LookupNotFoundWeak(w) ==
  /\ ~crashed
  /\ WeakEarlyNotFound
  /\ ApiType = "lookup"
  /\ journal[w].status = "intent"
  /\ applied[w] = 0
  /\ w \notin canNoLongerLand   \* no named guarantee — client just "gave up"
  /\ applied' = [applied EXCEPT ![w] = @ + 1]
  /\ journal' = [journal EXCEPT ![w] = [status |-> "reconciled", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "done"]
  /\ UNCHANGED <<nextWrite, inflight, canNoLongerLand, guaranteeReason, crashed, clock>>

\* Neither keys nor lookup, or lookup without a guarantee: stay unknown.
MarkUnknown(w) ==
  /\ ~crashed
  /\ journal[w].status = "intent"
  /\ \/ ApiType = "neither"
     \/ /\ ApiType = "lookup"
        /\ applied[w] = 0
        /\ w \notin canNoLongerLand
        /\ ~WeakEarlyNotFound
  /\ journal' = [journal EXCEPT ![w] =
       [status |-> "outcome_unknown", reference |-> w]]
  /\ clawqlDone' = [clawqlDone EXCEPT ![w] = "unknown"]
  /\ UNCHANGED <<nextWrite, inflight, applied, canNoLongerLand, guaranteeReason,
                 crashed, clock>>

AgentBlindRetry(w) ==
  /\ AllowBlindAgentRetry
  /\ ~crashed
  /\ ApiType = "neither"
  /\ journal[w].status \in {"intent", "outcome_unknown"}
  /\ applied' = [applied EXCEPT ![w] = @ + 1]
  /\ UNCHANGED <<nextWrite, journal, inflight, canNoLongerLand, guaranteeReason,
                 clawqlDone, crashed, clock>>

AgentRetryRefused(w) ==
  /\ ~AllowBlindAgentRetry
  /\ ~crashed
  /\ journal[w].status \in {"intent", "outcome_unknown"}
  /\ UNCHANGED vars

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextWrite, journal, inflight, applied, canNoLongerLand,
                 guaranteeReason, clawqlDone, crashed>>

-----------------------------------------------------------------------------
Next ==
  \/ SendWrite
  \/ \E w \in WriteId: ApplyInflight(w)
  \/ \E w \in WriteId, r \in GuaranteeReasons: ServerGuarantee(w, r)
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

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
NoDuplicateEffect ==
  \A w \in WriteId: applied[w] <= 1

NoFalseDone ==
  \A w \in WriteId:
    clawqlDone[w] = "done" => applied[w] >= 1

\* Safe resend is enabled only when w \in canNoLongerLand (see LookupNotFoundSafe).
\* WeakEarlyNotFound skips that guard; ApplyInflight can then double-apply →
\* NoDuplicateEffect fails (recorded counterexample).

UnknownOnlyWhenStuck ==
  \A w \in WriteId:
    clawqlDone[w] = "unknown" =>
      ApiType \in {"neither", "lookup"}

\* "Can no longer land" is never a bare client timeout — always a named reason.
GuaranteeNamed ==
  \A w \in canNoLongerLand: guaranteeReason[w] \in GuaranteeReasons

Safety ==
  /\ NoDuplicateEffect
  /\ NoFalseDone
  /\ GuaranteeNamed

StateConstraint == clock <= 5

=============================================================================
