# Durable-agent density — cross-system comparison

**Status:** ClawQL added **async-fsync double-buffering** and aligned ramp refine to **±1%**. Ontologiql still owes **flushStats** (fsyncs/sec + avg batch size) and a **serial-ceiling honesty check** (~52k fsync/s is suspiciously fast). Campaign on the dedicated host with write-cache settings recorded. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

Deadline accuracy remains **lab-only** until shared-host.

## Where each side stands

| Contract                           | ClawQL                                                   | Ontologiql                                                       |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| Serial fsync probe                 | Done (~7.9k/s, ~126 µs)                                  | Done (~52k/s, ~19 µs) — **sanity-check: likely early-ack cache** |
| Binary-search ramp                 | **±1%** (aligned)                                        | **±1%**                                                          |
| Batch size + fsyncs/sec during run | Done (`flushStats`)                                      | **Missing**                                                      |
| Writer kept busy between syncs     | **Done:** async-fsync double-buffer (`doubleBufferHits`) | Unknown until flushStats                                         |

## Serial-ceiling honesty

~52k serial fsyncs/s usually means hypervisor / volatile write cache, not media durability. SIGKILL cannot catch that (caches survive process death). Record campaign-host cache settings in evidence. An inflated ceiling makes “5.8% of ceiling” understate closeness to the true limit.

## ClawQL flushStats

| Point             | Finding                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pre–double-buffer | avgBatchSize 64, fsyncs ~3.2k (~40% of serial) → idle writer                                                                                                                                                                                                 |
| Fix               | `group_commit` uses **async fsync**; next batch accumulates during sync                                                                                                                                                                                      |
| Remeasure         | avgBatchSize **64**, **doubleBufferHits ≈ 100%**, fsyncsPerSec **~3.3k** (~42% of serial; fsync mean ~0.20 ms vs probe ~0.13 ms — journal path). Idle-writer fixed; residual ≠ missing double-buffer. → [`flush-batch-stats.json`](./flush-batch-stats.json) |

Ontologiql must emit the same two run numbers against the same serial probe.

## Shared-host campaign protocol

| Rule                    | Detail                                                      |
| ----------------------- | ----------------------------------------------------------- |
| Serial fsync first      | Board-matched; sanity-check latency; record disk cache mode |
| flushStats both sides   | fsyncs/sec + avgBatchSize during focus/ramp                 |
| Ramp refine             | **±1%** both sides                                          |
| 3-rep floor + alternate | ClawQL₁ → Ontologiql₁ → … on dedicated idle host            |
| Then merge              | `CLAWQL_DENSITY_PEER_JSON` when gates pass                  |

## ClawQL TypeScript — measured (this host; pre-campaign)

| Column / check           | Value                                                    |
| ------------------------ | -------------------------------------------------------- |
| Agents at limit          | **2,500,000**                                            |
| Flush / crash test       | group_commit + async fsync double-buffer; crash **pass** |
| Scaled bursts first miss | **250,000**                                              |
| Ramp                     | 3-rep floor + **±1%** refine                             |
| Deadline restart         | **pass** — rebuild **~40–55 ms** @ 2.5e6                 |
| Serial ceiling           | ~7,925/s → theo ~507k @ 64                               |

## Ontologiql — lab (different host)

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| Flush / crash test | group_commit; **pass**                             |
| Ramp               | refined **±1%** (lab)                              |
| rebuildFromDiskMs  | **~2–3** (compact-array)                           |
| Serial probe       | ~52k/s — **verify not early-ack** on campaign host |
| flushStats         | **required**                                       |

## Shared-host five arms

| Step                                                        | Status          |
| ----------------------------------------------------------- | --------------- |
| ClawQL serial probe + flushStats + double-buffer + ±1% ramp | done / shipping |
| Ontologiql flushStats + serial honesty on campaign host     | **pending**     |
| Interleaved 3-rep campaign on dedicated host                | **pending**     |
| Win copy                                                    | **blocked**     |

```bash
npm run benchmark:program-density-fsync-ceiling
npm run benchmark:program-density-flush-stats
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System              | Status                                                   | Notes                            |
| ------------------- | -------------------------------------------------------- | -------------------------------- |
| Ontologiql (Rust)   | Publishable capacity/wake; deadline lab; rebuild ~2–3 ms | flushStats + serial honesty next |
| ClawQL (TypeScript) | Double-buffer + ±1% refine + flushStats                  | Remeasure after double-buffer    |
| Golem / Infinity    | Pending invite                                           | fair-v2 / SHARED_HOST            |
