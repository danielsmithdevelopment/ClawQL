# Durable-agent density — cross-system comparison

**Status:** Same-campaign **3-rep** drain + sustained. ClawQL: sustained **equals drain within measurement error** — writer fully the limit. Ontologiql: ack ~2.5 µs + double-buffer (+46% drain). Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## ClawQL — same-campaign 3-rep (interleaved drain→sustained)

| | Mean | Min–Max | Stdev |
| --- | --- | --- | --- |
| durableRecordsPerSec | **~312k**/s | 278–333k | ~30k |
| rateSustainableWithinOneSecondSla | **~312k**/s | 280–336k | ~29k |
| drain / sustained | **1.01** | 0.87–1.19 | ~0.16 |

Diagnosis: `sustained_equals_drain_within_measurement_error` (ranges overlap). Single-run 352k vs 333k was noise — not a contradiction.

Prior path: short-ramp **636k** retracted → steady-state scheduler-bound **~140k** → coalesce/pop-all-due → writer-bound.

Sync p50/p99 ~129/**679** µs · ack **~2.5 µs**.

## Ontologiql (their report)

| Lever | Before → After |
| --- | --- |
| Journal ack | ~154 µs → **~2.5 µs** |
| Pure drain (dbuf off→on) | 161k → **235k (+46%)** |
| fsyncs/sec | 2.4k → **3.4k (+42%)** |

Double-buffer on by default; hit rate ~27% when concurrency ≥ 2× batch — still room if concurrency lifts hit rate. **Sustained ramp after ack+dbuf still needed** on their side for the comparable number.

## Where the comparison stands

Both writer-bound with near-identical ack costs (~2–2.5 µs). Shared-host campaign mostly measures how efficiently each turns the same disk’s fsyncs into durable records. Record sync **p99** every run.

## Ramp honesty

Continuous arrivals ≥30s/step (smoke 6–8s); fail growing backlog; **3 reps** of drain+sustained in one campaign; report ratio ± spread.

```bash
CLAWQL_DENSITY_REPS=3 CLAWQL_DENSITY_RAMP_STEP_MS=30000 \
  npm run benchmark:program-density-drain-vs-sustained
```
