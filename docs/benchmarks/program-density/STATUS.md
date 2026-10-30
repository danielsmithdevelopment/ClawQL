# Durable-agent density — cross-system comparison

**Status:** **Paused (ClawQL side done on this host).** Sustained equals drain within measurement error (~312k/s). ClawQL-only density/deadline numbers are **publishable as single-host lab** (mark “cross-system comparison pending”; parked-state caveat) — see [publish-readiness](../../gtm/publish-readiness.md). Ontologiql numbers stay private. Shared-host deadline campaign can wait. Infinity harness v2 (byte parity, runtime turns, slope, resident+offloaded, 8 G cgroup, latency gate) is in ([infinity-on-pi/](./infinity-on-pi/)) marked **`publishable: true`** with host disclosed; **Pi 5 deferred** as an extra column.

Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json) · PR [#1433](https://github.com/danielsmithdevelopment/ClawQL/pull/1433).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Converged characterization (different hosts)

| System                              | Sustained   | Drain       | Ratio                | Bound                          |
| ----------------------------------- | ----------- | ----------- | -------------------- | ------------------------------ |
| **ClawQL** (3-rep same campaign)    | **~312k**/s | **~312k**/s | **1.01** (0.87–1.19) | **writer** — done on this host |
| **Ontologiql** (20k, 30s, conc 256) | **185k**/s  | **320k**/s  | **~0.58**            | **scheduler** (post ack+dbuf)  |

Ack costs now match (~2.2–2.5 µs). If Ontologiql applies pop-all-due + ≤1ms coalesce + no idle-sleep while writers busy, sustained should meet drain (~310–320k each) pending shared-host.

## ClawQL — closed numbers

|                                   | Mean    | Min–Max   |
| --------------------------------- | ------- | --------- |
| durableRecordsPerSec              | ~312k/s | 278–333k  |
| rateSustainableWithinOneSecondSla | ~312k/s | 280–336k  |
| drain / sustained                 | 1.01    | 0.87–1.19 |

Diagnosis: `sustained_equals_drain_within_measurement_error`. Path: short-ramp 636k retracted → scheduler-bound ~140k → coalesce/pop-all-due → writer-bound. Sync p50/p99 ~129/**679** µs · ack ~2.5 µs.

## Ontologiql — next (their repo)

Loose ends closed on ack + double-buffer (drain 156→320k; ack ~2.2 µs; conc 256 best, 512 hurt; hit ~35%). Remaining gap is the **scheduler signature** ClawQL fixed:

1. Pop everything due on each wake
2. Coalesce timer wakes (~1ms)
3. Don't sleep while writers are busy

## Pause / next focus

- **This board:** pause. Shared-host deadline campaign when convenient.
- **Infinity harness v2 (`publishable: true`, host disclosed, `memory.swap.max=0`):** headline = **latency-gated matched-history memory fit** under 8 GiB — Infinity **77.5k** / ClawQL **100k** (~**29%** more histories; not full-runtime), RSS/N ~105 / ~79 KiB; both within 2× turn-latency of N=2.5k baseline. Forced reclaim disclosed both sides (`gc()` / `malloc_trim`). Ramp sample ClawQL 102.5k is not headline (latency not verified at edge). Open-host slopes ≈equal (~100–103 KiB) and mis-predict ClawQL’s 8 G fit. Offloaded is a separate trade-off (~1 KiB RSS + ~66 KiB disk), paired with Infinity serverless.
- Pi 5 as extra column when hardware is available.
- No win copy on shared-host deadline arms until that campaign runs.
