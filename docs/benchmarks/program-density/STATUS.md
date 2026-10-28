# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineAccuracy` pending). ClawQL TypeScript is **`measured`** under **fair-v2 / methodology v7** — durable-trigger fired definition, declared arrival rate, concurrent fires, O(log n) next-deadline, and a **sustainablePerSec** ramp (≥99% within 1s). Evidence: [`evidence-fair.json`](./evidence-fair.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule**; **deadlineAccuracy** = shared SLA (fire within 1s) with identical **fired definition**, declared **arrival rate**, concurrent fires, O(log n) next-deadline, % met + p99 excess-over-tick under **steady** and **burst**, plus **sustainablePerSec** (max steady rate with ≥99% within 1s).

## Methodology (v7 — backlog / throughput fix)

| Issue                                | Fix                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Steady ≪ burst looked like a mystery | Record **arrivalRatePerSec**. Backlog means offered rate > drain rate.                                                                                                                           |
| Next-deadline cost                   | **O(log n) binary min-heap** (peek O(1)); accuracy arms pad far-future entries to the claimed resident size so we do not measure a 2k heap while claiming 2.5e6.                                 |
| Serial bag wakes                     | Default **fired** = **durable_trigger_record** (approval-expiry semantics). Concurrent writers (default **64**). `bag_wake` remains an optional arm via env — do not compare across definitions. |
| Missing comparable headline          | Ramp offered steady rate until % within 1s drops below **99%** → **sustainablePerSec**.                                                                                                          |
| Ontologiql ~0.5 ms steady p99        | Both systems must declare the same fired definition before that number sits beside ClawQL.                                                                                                       |

**Superseded:** v6 “29.5% steady / 4375 ms excess” under serial **bag wakes** with an undeclared arrival rate — that was an implementation backlog, not a durable-trigger limit.

## ClawQL TypeScript — current evidence (v7)

Host: `clawql-cloud-agent-host`. Deadline schedule retained at limit. Deadline remeasure stressed a **2.5e6** resident heap (far-future pads) with durable trigger journal + concurrency 64.

| Column / check                                  | Value                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Status                                          | `measured`                                                                      |
| Agents at limit                                 | **2,500,000** (`limitResource=rss`)                                             |
| Deadline schedule entries                       | **2,500,000**                                                                   |
| Resident KiB/agent                              | ~0.21                                                                           |
| Disk bytes/agent                                | ~32.8 KiB                                                                       |
| Fired definition                                | `durable_trigger_record`                                                        |
| Scheduler                                       | `min_heap_setTimeout_to_next_deadline`, tickMs=1, concurrency=64, next=O(log n) |
| Deadline SLA                                    | **1000 ms** (≥99% target)                                                       |
| Steady arrival / % met / p99 excess             | **~667/s** / **100%** / **~273 ms**                                             |
| Burst drain / % met / p99 excess                | **~400k/s** / **100%** / **~149 ms**                                            |
| **sustainablePerSec**                           | **1,200,000** (3-rep median; cliff band ~1.0–1.3e6/s)                           |
| Wake warm p99 (median)                          | ~0.21 ms                                                                        |
| Wake cold p99 (median; range on headline order) | see `wakeSpread` — quote median+range only                                      |
| Restart survival                                | **yes**                                                                         |

**Reading the deadline numbers:** With durable trigger recording (not bag load) and a heap-sized resident schedule, steady at ~667/s meets the 1s SLA at 100%. The comparable throughput headline is **sustainablePerSec ≈ 1.2e6** deadlines/sec per node before % met falls below 99%. Single-shot ramps can report 1.0e6 at the noisy edge; 3-rep fine ladder median is 1.2e6. Invite Ontologiql to the same fired definition + arrival-rate ramp before any cross-system claim.

## Provisional positioning (different hosts — shared-host before any win)

| Column                | Reading                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Capacity**          | After mutual locator trim → disk/bag-size (~30 vs ~32.8 KiB). Deadline schedule is the surviving resident.                         |
| **Warm wakes**        | Ontologiql’s clearest published edge.                                                                                              |
| **Cold wakes**        | Do not compare until shared-host (median+range only).                                                                              |
| **Deadline accuracy** | ClawQL measured under durable_trigger_record + sustainablePerSec ramp. Ontologiql `deadlineAccuracy=null` until the same contract. |

```bash
npm run benchmark:program-density-fair
# CLAWQL_DENSITY_FIRED_DEFINITION=durable_trigger_record
# CLAWQL_DENSITY_DEADLINE_CONCURRENCY=64
# CLAWQL_DENSITY_DEADLINE_SLA_MS=1000 CLAWQL_DENSITY_DEADLINE_MAX_FIRES=2000 ...
# Focused throughput: node --expose-gc --import tsx scripts/benchmarks/program-density/measure-deadline-throughput.mjs
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Board snapshot

| System              | Status                         | Notes                                                                            |
| ------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** (pre-deadline) | `deadlineAccuracy=null` until fair-v2 remeasure under same fired def + rate ramp |
| ClawQL (TypeScript) | **measured** (fair-v2 / v7)    | rss@2.5e6; durable fire; sustainablePerSec≈1.2e6                                 |
| Golem / Infinity    | Pending invite                 | fair-v2 deadlines                                                                |
