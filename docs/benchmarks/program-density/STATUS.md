# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineAccuracy` pending). ClawQL TypeScript is **`measured`** under **fair-v2 / methodology v9** — durable trigger fire with an **explicit flush policy**, lateness stamped **after fsync**, **typed-array** schedule (board default) with an **object-heap GC A/B**, arrival-rate ramp, and a **SIGKILL crash test**. Evidence: [`evidence-fair.json`](./evidence-fair.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule**; **deadlineAccuracy** = shared SLA (fire within 1s) with identical **fired definition**, identical **flush policy** (or each row discloses its own), declared **schedule shape**, declared **arrival rate**, concurrent fires, O(log n) next-deadline, **sustainablePerSec**, and a **crash test**.

## Methodology (v9 — GC honesty / typed schedule)

| Issue                                           | Fix                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “1.2e6 durable/s” was too high for real flushes | Prior journal used **writeSync only** (OS page cache). That is **`os_buffer`**, not crash-durable. Superseded.                                                          |
| What “durable” means                            | Explicit **flush policy** in evidence: `os_buffer` \| `fsync_each` \| `group_commit(batchMax, flushIntervalMs)`.                                                        |
| When is a fire counted?                         | Lateness stamped **after** the configured flush (fsync / group-commit fsync). Unflushed batches are never counted.                                                      |
| Durability window                               | For crash-safe policies with post-fsync stamps: **counted fires have window 0**. A crash can lose only in-flight (not-yet-acked) work.                                  |
| Prove it                                        | **SIGKILL mid-drain**: every ACK’d (counted) fire must be on disk after restart; no duplicates.                                                                         |
| Steady p99 ~293 ms under object heap            | **GC tracing** + A/B: object-per-entry pad (2.5e6 JS objects) produced a **~121 ms major GC**; **100%** of late fires (≥50 ms) overlapped that pause. Not a flush knob. |
| Fair TS best-effort                             | Board default = **`typed_arrays`** (Float64 deadlines + Int32 heap indices; sparse agent Map). Object-heap A/B retained as the GC-cost column.                          |

**Superseded:** v7 `sustainablePerSec≈1.2e6` under undeclared `os_buffer`; v8 steady excess ~293 ms attributed only to “timer/event-loop” without GC A/B.

## ClawQL TypeScript — current evidence (v9)

Host: `clawql-cloud-agent-host`. Resident heap pad **2.5e6**. Board default flush = **group_commit** (batchMax=64, flushIntervalMs=10, fsync). Board default schedule = **`typed_arrays`**.

| Column / check                               | Value                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Status                                       | `measured`                                                                  |
| Agents at limit                              | **2,500,000** (`limitResource=rss`)                                         |
| Schedule shape                               | **`typed_arrays`** (board default)                                          |
| Fired definition                             | `durable_trigger_record`                                                    |
| Flush policy                                 | `group_commit` batchMax=64 intervalMs=10 (`fsync_group_commit`)             |
| Crash test                                   | **pass** (SIGKILL; counted fires on disk; no duplicates)                    |
| Steady arrival / % met / p99 excess          | **~667/s** / **100%** / **~22 ms** (typed)                                  |
| Burst drain / % met / p99 excess             | **~54k/s** / **100%** / **~21 ms** (typed)                                  |
| Object-heap A/B (diagnostic)                 | Steady excess p99 **~314 ms**; major GC **~121 ms**; **100%** late∩major-GC |
| **sustainablePerSec** (typed + group_commit) | **256,000** (3-rep floor = median = max)                                    |
| fsync_each (diagnostic)                      | **~24,000**/s sustainable under same SLA                                    |
| os_buffer (diagnostic only)                  | ~1.2e6 — **not crash-durable; do not publish**                              |

**Reading the numbers:** Group commit is a legitimate durability mode (DB-style), but it must be named. Per-record `fsync_each` is the stricter bound (~24k/s here). The ~300 ms object-heap tail is a **real TypeScript/V8 cost** under a multi-million object schedule; Rust has no equivalent collector pause. Publishing the **typed-array** figure shows TS at its best; keeping the object A/B keeps the column honest. Ontologiql must run the same fired definition + flush policy (or disclose) before side-by-side.

## Provisional positioning (different hosts — shared-host before any win)

| Column                | Reading                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacity**          | After mutual locator trim → disk/bag-size (~30 vs ~32.8 KiB).                                                                                         |
| **Warm / cold wakes** | Warm: Ontologiql’s published edge. Cold: median+range only until shared-host.                                                                         |
| **Deadline accuracy** | ClawQL measured under typed_arrays + group_commit + crash test; object-heap GC disclosed. Ontologiql `deadlineAccuracy=null` until the same contract. |

```bash
npm run benchmark:program-density-fair
# CLAWQL_DENSITY_FLUSH_MODE=group_commit CLAWQL_DENSITY_FLUSH_BATCH_MAX=64 CLAWQL_DENSITY_FLUSH_INTERVAL_MS=10
# Focused: node --expose-gc --import tsx scripts/benchmarks/program-density/measure-deadline-throughput.mjs
# GC A/B: node --expose-gc --import tsx scripts/benchmarks/program-density/measure-gc-pad-and-pump.mjs
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Board snapshot

| System              | Status                         | Notes                                                                                      |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Ontologiql (Rust)   | **Publishable** (pre-deadline) | Invite: same fired def + flush policy + crash test                                         |
| ClawQL (TypeScript) | **measured** (fair-v2 / v9)    | typed_arrays; group_commit; crashTest pass; sustainablePerSec floor 256k; GC A/B disclosed |
| Golem / Infinity    | Pending invite                 | fair-v2 deadlines                                                                          |
