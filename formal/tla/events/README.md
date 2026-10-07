# Event delivery (TLA+)

## Guarantee (honest)

**At-least-once delivery with a stable event ID.** Receivers that drop duplicates **process** each event exactly once.

True exactly-once delivery over HTTP is not achievable: if a receiver handles an event and the acknowledgment is lost, the broker redelivers. Do not claim “delivered once” on the security page or in the launch video.

| Caption / copy | Status |
| --- | --- |
| “Same event ID, delivered once” | **Overclaim — do not use** |
| “Same event ID, processed once” | Accurate (receiver dedup) |

**Video fix (60s launch):** change the events-scene caption from “delivered once” → “processed once” (two words; re-render that frame range). Keeps the video consistent with this model and the security page.

## What the model covers

- Queue-group replicas (competing workers)
- NATS-style redelivery after ack timeout / crash between deliver and ack
- Receiver deduplication by event ID (`WeakNoDedup = FALSE`)
- Stream resume from last event ID across a replica switch
- Redaction before publish

## Invariants

**Safety** (always includes `AtMostOnceProcess` — dual-config oracle)

- A duplicate always carries the same ID (`StableEventIds`)
- No unredacted payload is ever published
- A resumed stream has no gaps (`NoResumeGaps`)
- At most one **process** per (subscriber, eventId) — holds when `WeakNoDedup = FALSE`

**Liveness (under fairness):** every published event is eventually delivered at least once (`EventualDelivery` property).

## Files

| File | Role |
| --- | --- |
| `EventDelivery.tla` | Spec |
| `EventDelivery.cfg` | Target (dedup on) — must pass |
| `EventDeliveryWeak.cfg` | No dedup — must counterexample `AtMostOnceProcess` |

Maps to `packages/clawql-mcp-events` (`delivery.ts`, `event-stream.ts`, `nats-subjects.ts`).
