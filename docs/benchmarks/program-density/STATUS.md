# Durable-agent density — cross-system comparison

**Status:** Both sides measured the same way. ClawQL double-buffer is **active** but did **not** move fsync rate toward the serial ceiling — relabeled **producer-bound under investigation** (pop/encode CPU ruled out). Ontologiql serial probe fixed (~8.9k/s); flushStats show the same idle pattern. Campaign next. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Where each side stands

| Contract                     | ClawQL                                       | Ontologiql                                            |
| ---------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| Serial fsync (board-matched) | ~7.9k/s (~126 µs)                            | ~8.9k/s (~112 µs); overwrite ~50k **retracted**       |
| Ramp refine                  | ±1%                                          | 196k/198k **±0.5%**                                   |
| flushStats                   | Done                                         | Done — avgBatch ~64, fsyncs ~2.2k ≈ **24%** of serial |
| Double-buffer                | Active (hits≈100%); **fsync rate unchanged** | Not yet — **profile producer first**                  |

## ClawQL: double-buffer remeasure (corrected reading)

|                  | Before                 | After                               |
| ---------------- | ---------------------- | ----------------------------------- |
| avgBatchSize     | 64                     | 64                                  |
| doubleBufferHits | n/a                    | ≈100%                               |
| fsyncs/sec       | ~3.2k (~40% of serial) | ~3.3–4.4k (still ~40–55% of serial) |

**Not “idle writer fixed.”** Label: **double-buffer active; fsync rate unchanged; producer-bound under investigation.**

### Pump profile ([`pump-profile.json`](./pump-profile.json))

| Stage                                    | Cost                        |
| ---------------------------------------- | --------------------------- |
| Heap `popDue`                            | ~0.26 µs/record             |
| JSON encode                              | ~0.3 µs/record              |
| Journal enqueue (sync)                   | ~0.7 µs/record              |
| Noop drain (pop+encode, no durable wait) | **~1.3M**/s                 |
| Durable drain (group_commit)             | **~286k**/s; fsyncs ~4.2k/s |

Heap pop / encode CPU are **not** the ~210–280k bound. Residual sits in the durable/journal path under load (fsync latency vs probe, event-loop around await). Sustained durable after double-buffer ≈ **286k/s** (flushStats imply ~281k in focus window) — same order as before.

Ontologiql at **24%** of serial with full batches may match; **profile its pump before double-buffering**.

## Shared-host campaign (unblocked for compare)

Same measurement contract on both sides. Interleaved 3-rep run on the **dedicated** host with write-cache settings recorded. Knowing each limit (disk vs producer) makes shared-host numbers explainable.

```bash
npm run benchmark:program-density-fsync-ceiling
npm run benchmark:program-density-flush-stats
npm run benchmark:program-density-pump-profile
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System           | Status                                                          | Notes                        |
| ---------------- | --------------------------------------------------------------- | ---------------------------- |
| Ontologiql       | Lab deadlines; serial fixed; flushStats idle pattern            | Profile before double-buffer |
| ClawQL           | Double-buffer on; fsync rate flat; producer under investigation | Campaign-ready for compare   |
| Golem / Infinity | Pending invite                                                  | fair-v2 / SHARED_HOST        |
