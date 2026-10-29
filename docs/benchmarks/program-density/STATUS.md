# Durable-agent density — cross-system comparison

**Status:** Steady-state ramp made both systems consistent. ClawQL’s gap (140k sustained vs 347k drain) was **scheduler-bound**; after pop-all-due + coalesce wakes + no idle-sleep while writers are busy, sustained climbs to the drain. Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Honest summary (different hosts)

Roughly equal sustained throughput (~140–150k before ClawQL’s scheduler fix; ClawQL now ~drain), both well short of serial fsync×batch ceiling, **different bottlenecks**.

| System                      | Sustained   | Drain       | Ratio | Bound                                     |
| --------------------------- | ----------- | ----------- | ----- | ----------------------------------------- |
| **ClawQL** (after coalesce) | **~352k**/s | **~333k**/s | ~0.95 | **writer-bound** (was scheduler at ~140k) |
| **Ontologiql** (30s steps)  | **~148k**/s | **~156k**/s | ~1.05 | **write-path** (ack ~154 µs/batch)        |

## ClawQL scheduler fix

| Lever       | Change                                                               |
| ----------- | -------------------------------------------------------------------- |
| Pop-all-due | Each wake emits **every** arrival due through now                    |
| Coalesce    | Idle sleeps ≤1 ms (`coalesceWakeMs`); never sleep while `inFlight>0` |
| Queue       | O(1) pending head (no `Array.shift`)                                 |

Before: sustained **~140k** vs drain **~347k** (`latency_limit_…`). After: sustained **~352k** ≈ drain — `writer_bound_sustained_near_drain`. Prior short-ramp **636k** remains retracted.

## Cycle / sync tails

|                | ClawQL            | Ontologiql                          |
| -------------- | ----------------- | ----------------------------------- |
| write          | ~10 µs            | ~37 µs                              |
| sync p50 / p99 | ~114 / **426** µs | ~101 / **986** µs                   |
| ack / batch    | **~2 µs**         | **~154 µs** ← next Ontologiql lever |

Record sync **p99** on every result. Disk tails differ by host — campaign host will shift both.

## Ontologiql next levers

- Cut ack ~154 µs/batch (largest non-sync cost)
- Double-buffer trial judged by before/after **drain + fsyncs/sec** (writer ~24% of serial ceiling)

## Ramp honesty (both)

Continuous arrivals ≥30s/step; fail growing backlog; record `stepDurationMs` + `backlogTrend`. Sustained ≤ drain.

## Shared-host campaign

```bash
CLAWQL_DENSITY_RAMP_STEP_MS=30000 \
  npm run benchmark:program-density-drain-vs-sustained
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```
