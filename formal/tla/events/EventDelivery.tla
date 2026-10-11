----------------------------- MODULE EventDelivery -----------------------------
(***************************************************************************)
(* ClawQL event delivery — honest guarantee:                               *)
(*                                                                         *)
(*   At-least-once delivery with a stable event ID.                        *)
(*   Receivers that drop duplicates process each event exactly once.       *)
(*                                                                         *)
(* True exactly-once over HTTP is not achievable: if a receiver handles    *)
(* an event and the ack is lost, the broker will redeliver.                *)
(*                                                                         *)
(* Models: queue-group replicas, NATS redelivery after ack timeout,        *)
(* consumer crash between delivery and ack, receiver dedup by ID,          *)
(* stream resume from last event ID across a replica switch.               *)
(*                                                                         *)
(* WeakNoDedup = FALSE (target): receiver deduplicates by eventId.         *)
(* WeakNoDedup = TRUE:  receiver applies every delivery (double-process).  *)
(*                                                                         *)
(* Dual TLC: target must pass Safety; weak must counterexample             *)
(* AtMostOnceProcess (included in Safety, same pattern as mandate).        *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Publishers,
  Workers,             \* queue-group competing consumers
  MaxEvents,
  Subscribers,         \* logical receivers (with optional dedup)
  WeakNoDedup          \* BOOLEAN — TRUE = forget to dedup

VARIABLES
  nextSeq,
  log,                 \* seq -> eventId (stable; retries reuse)
  cursor,              \* subscriber -> last observed seq (resume / Last-Event-ID)
  inflight,            \* worker -> seq being delivered (0 = idle)
  claimedDelivered,    \* worker -> BOOL — Deliver once per claim
  deliveryAttempts,    \* eventId -> Nat (at-least-once: may be >1)
  processed,           \* subscriber -> [eventId -> Nat] after receiver handling
  redacted,            \* eventId -> Bool — payload redacted before publish
  clock

EventId == 1..MaxEvents
LogIdx == 1..MaxEvents

TypeOK ==
  /\ nextSeq \in 1..(MaxEvents + 1)
  /\ clock \in Nat
  /\ cursor \in [Subscribers -> Nat]
  /\ inflight \in [Workers -> Nat]
  /\ claimedDelivered \in [Workers -> BOOLEAN]
  /\ log \in [LogIdx -> Nat]
  /\ deliveryAttempts \in [EventId -> Nat]
  /\ processed \in [Subscribers -> [EventId -> Nat]]
  /\ redacted \in [EventId -> BOOLEAN]

Init ==
  /\ nextSeq = 1
  /\ log = [s \in LogIdx |-> 0]
  /\ cursor = [sub \in Subscribers |-> 0]
  /\ inflight = [w \in Workers |-> 0]
  /\ claimedDelivered = [w \in Workers |-> FALSE]
  /\ deliveryAttempts = [eid \in EventId |-> 0]
  /\ processed = [sub \in Subscribers |-> [eid \in EventId |-> 0]]
  /\ redacted = [eid \in EventId |-> FALSE]
  /\ clock = 0

\* Publish assigns stable eventId (= seq). Payload is redacted before leave.
Publish(p) ==
  /\ p \in Publishers
  /\ nextSeq <= MaxEvents
  /\ LET s == nextSeq IN
       /\ log' = [log EXCEPT ![s] = s]
       /\ redacted' = [redacted EXCEPT ![s] = TRUE]
       /\ nextSeq' = nextSeq + 1
  /\ UNCHANGED <<cursor, inflight, claimedDelivered, deliveryAttempts, processed, clock>>

\* Queue-group claim: next after cursor, exclusive among workers.
Claim(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] = 0
  /\ LET nxt == cursor[sub] + 1 IN
       /\ nxt < nextSeq
       /\ log[nxt] # 0
       /\ \A w2 \in Workers : inflight[w2] # nxt
       /\ inflight' = [inflight EXCEPT ![w] = nxt]
       /\ claimedDelivered' = [claimedDelivered EXCEPT ![w] = FALSE]
  /\ UNCHANGED <<nextSeq, log, cursor, deliveryAttempts, processed, redacted, clock>>

\* Redelivery after ack timeout / NATS redelivery: claim an already-attempted
\* seq whose cursor has not advanced (ack never landed).
Redeliver(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] = 0
  /\ \E s \in LogIdx :
       /\ s < nextSeq
       /\ s > cursor[sub]   \* not yet acked by subscriber
       /\ log[s] # 0
       /\ deliveryAttempts[log[s]] > 0
       /\ \A w2 \in Workers : inflight[w2] # s
       /\ inflight' = [inflight EXCEPT ![w] = s]
       /\ claimedDelivered' = [claimedDelivered EXCEPT ![w] = FALSE]
  /\ UNCHANGED <<nextSeq, log, cursor, deliveryAttempts, processed, redacted, clock>>

\* Deliver to receiver once per claim: count attempt; process if new ID (or always if Weak).
Deliver(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] # 0
  /\ ~claimedDelivered[w]
  /\ LET s == inflight[w]
         eid == log[s]
     IN
       /\ eid # 0
       /\ redacted[eid] = TRUE
       /\ claimedDelivered' = [claimedDelivered EXCEPT ![w] = TRUE]
       /\ deliveryAttempts' = [deliveryAttempts EXCEPT ![eid] = @ + 1]
       /\ IF WeakNoDedup \/ processed[sub][eid] = 0
          THEN processed' = [processed EXCEPT ![sub][eid] = @ + 1]
          ELSE UNCHANGED processed
       /\ UNCHANGED <<nextSeq, log, cursor, inflight, redacted, clock>>

\* Ack advances cursor (resume point). Lost ack ⇒ Redeliver / Claim may fire.
Ack(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] # 0
  /\ claimedDelivered[w]   \* must have delivered before ack
  /\ LET s == inflight[w] IN
       /\ inflight' = [inflight EXCEPT ![w] = 0]
       /\ claimedDelivered' = [claimedDelivered EXCEPT ![w] = FALSE]
       /\ cursor' = [cursor EXCEPT ![sub] =
            IF s > cursor[sub] THEN s ELSE cursor[sub]]
  /\ UNCHANGED <<nextSeq, log, deliveryAttempts, processed, redacted, clock>>

\* Crash between deliver and ack: release inflight; cursor unchanged.
Crash(w) ==
  /\ w \in Workers
  /\ inflight[w] # 0
  /\ inflight' = [inflight EXCEPT ![w] = 0]
  /\ claimedDelivered' = [claimedDelivered EXCEPT ![w] = FALSE]
  /\ UNCHANGED <<nextSeq, log, cursor, deliveryAttempts, processed, redacted, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextSeq, log, cursor, inflight, claimedDelivered,
                 deliveryAttempts, processed, redacted>>

Next ==
  \/ \E p \in Publishers : Publish(p)
  \/ \E w \in Workers, sub \in Subscribers : Claim(w, sub)
  \/ \E w \in Workers, sub \in Subscribers : Redeliver(w, sub)
  \/ \E w \in Workers, sub \in Subscribers : Deliver(w, sub)
  \/ \E w \in Workers, sub \in Subscribers : Ack(w, sub)
  \/ \E w \in Workers : Crash(w)
  \/ Tick

vars == <<nextSeq, log, cursor, inflight, claimedDelivered,
          deliveryAttempts, processed, redacted, clock>>

Spec == Init /\ [][Next]_vars

\* --- Safety ---

\* Duplicates always carry the same stable id (log[s] never changes once set).
StableEventIds ==
  \A s \in LogIdx :
    log[s] # 0 => log[s] = s

\* No unredacted payload is ever published (Deliver requires redacted).
NoUnredactedPublish ==
  \A eid \in EventId :
    deliveryAttempts[eid] > 0 => redacted[eid] = TRUE

\* Resumed stream has no gaps: cursor is a prefix of the log.
NoResumeGaps ==
  \A sub \in Subscribers :
    \A s \in LogIdx :
      (s <= cursor[sub] /\ s < nextSeq) => log[s] # 0

\* Each event processed at most once per subscriber (requires receiver dedup).
AtMostOnceProcess ==
  \A sub \in Subscribers :
    \A eid \in EventId : processed[sub][eid] <= 1

\* Safety always includes AtMostOnceProcess (mandate dual-config pattern):
\* target (WeakNoDedup=FALSE) must pass; weak must counterexample.
Safety ==
  /\ TypeOK
  /\ StableEventIds
  /\ NoUnredactedPublish
  /\ NoResumeGaps
  /\ AtMostOnceProcess

\* --- Liveness (checked under fairness assumptions in the Toolbox / TLC) ---
\* Every published event is eventually delivered at least once.
\* TLC: PROPERTY EventualDelivery under WF_vars(Next) — optional / large.
EventualDelivery ==
  \A s \in LogIdx :
    (log[s] # 0) ~> (deliveryAttempts[log[s]] > 0)

\* Bound redelivery / clock so TLC finishes in CI.
StateConstraint ==
  /\ clock <= 6
  /\ \A eid \in EventId : deliveryAttempts[eid] <= 3
  /\ \A sub \in Subscribers : \A eid \in EventId : processed[sub][eid] <= 3

=============================================================================
