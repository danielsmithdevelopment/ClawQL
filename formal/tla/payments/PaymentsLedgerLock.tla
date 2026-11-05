--------------------------- MODULE PaymentsLedgerLock ---------------------------
(***************************************************************************)
(* Multi-node tenant ledger mutual exclusion with fencing tokens.          *)
(*                                                                         *)
(* Target: SET NX acquire → critical section only while token matches →    *)
(* compare-and-delete release. At most one node in CS.                     *)
(*                                                                         *)
(* WeakNoFence = TRUE allows overwrite-acquire and unfenced release        *)
(* (clears another owner's lock) — must COUNTEREXAMPLE AtMostOneInCS.      *)
(*                                                                         *)
(* Maps to: ledger-lock.ts (in-process | Valkey/Redis | PG advisory).      *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, TLC

CONSTANTS
  Nodes,          \* e.g. {"n1","n2"}
  WeakNoFence,    \* BOOLEAN
  MaxClock,
  MaxToken        \* bound fence counter (finite model)

VARIABLES
  lockOwner,      \* "none" or a node
  lockToken,      \* 0..MaxToken — bumps on every successful acquire
  nodeToken,      \* [n \in Nodes |-> 0..MaxToken] token node believes it holds (0 = none)
  inCS,           \* [n \in Nodes |-> BOOLEAN]
  clock

TypeOK ==
  /\ lockOwner \in ({"none"} \cup Nodes)
  /\ lockToken \in 0..MaxToken
  /\ nodeToken \in [Nodes -> 0..MaxToken]
  /\ inCS \in [Nodes -> BOOLEAN]
  /\ clock \in 0..MaxClock

Init ==
  /\ lockOwner = "none"
  /\ lockToken = 0
  /\ nodeToken = [n \in Nodes |-> 0]
  /\ inCS = [n \in Nodes |-> FALSE]
  /\ clock = 0

Tick ==
  /\ clock < MaxClock
  /\ clock' = clock + 1
  /\ UNCHANGED <<lockOwner, lockToken, nodeToken, inCS>>

\* SET key token NX PX — only when free.
Acquire(n) ==
  /\ n \in Nodes
  /\ lockOwner = "none"
  /\ nodeToken[n] = 0
  /\ ~inCS[n]
  /\ lockToken < MaxToken
  /\ lockOwner' = n
  /\ lockToken' = lockToken + 1
  /\ nodeToken' = [nodeToken EXCEPT ![n] = lockToken + 1]
  /\ UNCHANGED <<inCS, clock>>

\* Weak bug: SET without NX overwrites another holder.
OverwriteAcquire(n) ==
  /\ WeakNoFence
  /\ n \in Nodes
  /\ lockOwner # "none"
  /\ lockOwner # n
  /\ nodeToken[n] = 0
  /\ ~inCS[n]
  /\ lockToken < MaxToken
  /\ lockOwner' = n
  /\ lockToken' = lockToken + 1
  /\ nodeToken' = [nodeToken EXCEPT ![n] = lockToken + 1]
  /\ UNCHANGED <<inCS, clock>>

\* Enter CS only with a live fence (target) or any local token (weak).
EnterCS(n) ==
  /\ n \in Nodes
  /\ nodeToken[n] # 0
  /\ ~inCS[n]
  /\ IF WeakNoFence
       THEN TRUE
       ELSE (lockOwner = n /\ nodeToken[n] = lockToken)
  /\ inCS' = [inCS EXCEPT ![n] = TRUE]
  /\ UNCHANGED <<lockOwner, lockToken, nodeToken, clock>>

LeaveCS(n) ==
  /\ n \in Nodes
  /\ inCS[n]
  /\ inCS' = [inCS EXCEPT ![n] = FALSE]
  /\ UNCHANGED <<lockOwner, lockToken, nodeToken, clock>>

\* Compare-and-delete: only clear store if token still matches.
ReleaseFenced(n) ==
  /\ n \in Nodes
  /\ nodeToken[n] # 0
  /\ ~inCS[n]
  /\ IF nodeToken[n] = lockToken /\ lockOwner = n
       THEN /\ lockOwner' = "none"
            /\ UNCHANGED lockToken
       ELSE UNCHANGED <<lockOwner, lockToken>>
  /\ nodeToken' = [nodeToken EXCEPT ![n] = 0]
  /\ UNCHANGED <<inCS, clock>>

\* Weak bug: DEL without token check — can drop another owner's lock.
ReleaseUnfenced(n) ==
  /\ WeakNoFence
  /\ n \in Nodes
  /\ nodeToken[n] # 0
  /\ ~inCS[n]
  /\ lockOwner' = "none"
  /\ nodeToken' = [nodeToken EXCEPT ![n] = 0]
  /\ UNCHANGED <<lockToken, inCS, clock>>

Next ==
  \/ Tick
  \/ \E n \in Nodes :
       \/ Acquire(n)
       \/ OverwriteAcquire(n)
       \/ EnterCS(n)
       \/ LeaveCS(n)
       \/ ReleaseFenced(n)
       \/ ReleaseUnfenced(n)

Spec == Init /\ [][Next]_<<lockOwner, lockToken, nodeToken, inCS, clock>>

AtMostOneInCS ==
  Cardinality({ n \in Nodes : inCS[n] }) <= 1

\* Target: CS implies current fence ownership.
FenceHoldsInCS ==
  \A n \in Nodes :
    inCS[n] => (lockOwner = n /\ nodeToken[n] = lockToken)

Safety == TypeOK /\ AtMostOneInCS /\ (~WeakNoFence => FenceHoldsInCS)

=============================================================================
