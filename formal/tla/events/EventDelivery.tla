----------------------------- MODULE EventDelivery -----------------------------
(***************************************************************************)
(* ClawQL event delivery — at-most-once per (subscriber, eventId).         *)
(* Queue-group workers, retries under the same id, stream resume.          *)
(*                                                                         *)
(* WeakAtMostOnce = FALSE: exclusive claim + refuse re-deliver.            *)
(* WeakAtMostOnce = TRUE:  second worker may deliver an already-acked id.  *)
(***************************************************************************)

EXTENDS Naturals, FiniteSets, Sequences, TLC

CONSTANTS
  Publishers,
  Workers,
  MaxEvents,
  Subscribers,
  WeakAtMostOnce

VARIABLES
  nextSeq,
  log,
  cursor,
  inflight,
  deliveryCount,
  clock

EventId == 1..MaxEvents
\* Avoid name `Seq` — clashes with Sequences!Seq.
LogIdx == 1..MaxEvents

TypeOK ==
  /\ nextSeq \in 1..(MaxEvents + 1)
  /\ clock \in Nat
  /\ cursor \in [Subscribers -> Nat]
  /\ inflight \in [Workers -> Nat]
  /\ log \in [LogIdx -> Nat]
  /\ deliveryCount \in [Subscribers -> [EventId -> Nat]]

Init ==
  /\ nextSeq = 1
  /\ log = [s \in LogIdx |-> 0]
  /\ cursor = [sub \in Subscribers |-> 0]
  /\ inflight = [w \in Workers |-> 0]
  /\ deliveryCount = [sub \in Subscribers |-> [eid \in EventId |-> 0]]
  /\ clock = 0

Publish(p) ==
  /\ p \in Publishers
  /\ nextSeq <= MaxEvents
  /\ LET s == nextSeq IN
       /\ log' = [log EXCEPT ![s] = s]
       /\ nextSeq' = nextSeq + 1
  /\ UNCHANGED <<cursor, inflight, deliveryCount, clock>>

\* Target: next after cursor, exclusive among workers, not yet delivered.
\* Weak: may re-claim an already-delivered seq (double-deliver race).
Claim(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] = 0
  /\ IF ~WeakAtMostOnce
     THEN LET nxt == cursor[sub] + 1 IN
            /\ nxt < nextSeq
            /\ log[nxt] # 0
            /\ \A w2 \in Workers : inflight[w2] # nxt
            /\ deliveryCount[sub][log[nxt]] = 0
            /\ inflight' = [inflight EXCEPT ![w] = nxt]
     ELSE \E s \in LogIdx :
            /\ s < nextSeq
            /\ log[s] # 0
            /\ \A w2 \in Workers : inflight[w2] # s
            /\ inflight' = [inflight EXCEPT ![w] = s]
  /\ UNCHANGED <<nextSeq, log, cursor, deliveryCount, clock>>

Ack(w, sub) ==
  /\ w \in Workers
  /\ sub \in Subscribers
  /\ inflight[w] # 0
  /\ LET s == inflight[w]
         eid == log[s]
     IN
       /\ eid # 0
       /\ inflight' = [inflight EXCEPT ![w] = 0]
       /\ cursor' = [cursor EXCEPT ![sub] =
            IF s > cursor[sub] THEN s ELSE cursor[sub]]
       /\ deliveryCount' = [deliveryCount EXCEPT ![sub][eid] = @ + 1]
  /\ UNCHANGED <<nextSeq, log, clock>>

Fail(w) ==
  /\ w \in Workers
  /\ inflight[w] # 0
  /\ inflight' = [inflight EXCEPT ![w] = 0]
  /\ UNCHANGED <<nextSeq, log, cursor, deliveryCount, clock>>

Resume(sub) ==
  /\ sub \in Subscribers
  /\ UNCHANGED <<nextSeq, log, cursor, inflight, deliveryCount, clock>>

Tick ==
  /\ clock' = clock + 1
  /\ UNCHANGED <<nextSeq, log, cursor, inflight, deliveryCount>>

Next ==
  \/ \E p \in Publishers : Publish(p)
  \/ \E w \in Workers, sub \in Subscribers : Claim(w, sub)
  \/ \E w \in Workers, sub \in Subscribers : Ack(w, sub)
  \/ \E w \in Workers : Fail(w)
  \/ \E sub \in Subscribers : Resume(sub)
  \/ Tick

vars == <<nextSeq, log, cursor, inflight, deliveryCount, clock>>

Spec == Init /\ [][Next]_vars

AtMostOncePerSubscriber ==
  \A sub \in Subscribers :
    \A eid \in EventId : deliveryCount[sub][eid] <= 1

Safety ==
  /\ TypeOK
  /\ AtMostOncePerSubscriber

StateConstraint == clock <= 6

=============================================================================
