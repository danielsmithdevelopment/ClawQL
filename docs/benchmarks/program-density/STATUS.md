# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineAccuracy` pending). ClawQL TypeScript is **`measured`** under **fair-v2 / methodology v10** — flush policy + crash test, typed-array schedule + GC A/B, and the two **SHARED_HOST** deadline arms (scaled bursts + deadline restart). Shared-host run still pending. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule**; **deadlineAccuracy** = shared SLA (fire within 1s) with identical **fired definition**, identical **flush policy** (or disclose), **schedule shape**, **scaled bursts** (first miss), **deadline restart**, arrival rate, concurrent fires, O(log n) next-deadline, **sustainablePerSec**, and a **flush crash test**.

## Methodology (v10 — SHARED_HOST deadline arms)

| Issue | Fix |
| --- | --- |
| Flush honesty | Explicit policy; lateness after fsync; SIGKILL mid-drain crash test (v8). |
| ~300 ms steady tail | GC A/B on object heap; board default **typed_arrays** (v9). |
| Burst size vs Ontologiql | **Scaled bursts** at 512 / 10k / 100k / …; headline = **first size that misses** the 1s SLA. |
| Deadlines across restart | Persist schedule → SIGKILL with pending → downtime (some due) → **rebuild time** at full scale → no loss/duplicates → **prompt overdue** catch-up. |

**Superseded:** v7 os_buffer rates; v8 “timer-only” steady tail; v9 without scaled bursts / deadline restart.

## ClawQL TypeScript — current evidence (v10)

Host: `clawql-cloud-agent-host`. Resident heap pad **2.5e6**. Flush = **group_commit** (64 / 10 ms). Schedule = **`typed_arrays`**.

| Column / check | Value |
| --- | --- |
| Status | `measured` |
| Agents at limit | **2,500,000** (`limitResource=rss`) |
| Schedule shape | **`typed_arrays`** |
| Flush / crash test | group_commit; **pass** |
| Steady @ ~667/s | 100% met / excess p99 **~22 ms** |
| **Scaled bursts first miss** | **250,000** (512 / 10k / 100k met 100%; 250k → 63% met, p99 ~1333 ms) |
| **Deadline restart** | **pass** — rebuild **~40 ms** @ 2.5e6 capacity; 5k/5k overdue prompt-fired; no loss/duplicates |
| **sustainablePerSec** | **256,000** (typed + group_commit; 3-rep floor) |
| Object-heap A/B | excess p99 ~314 ms; major GC ~121 ms; 100% late∩major-GC |

**Reading:** ClawQL’s SHARED_HOST deadline arms are measured on this host. Ontologiql must disclose + crash-test flush policy and publish the same scaled-burst + restart numbers before side-by-side. No win copy until shared-host.

## Provisional positioning (different hosts — shared-host before any win)

| Column | Reading |
| --- | --- |
| **Capacity** | After mutual locator trim → disk/bag-size (~30 vs ~32.8 KiB). |
| **Warm / cold wakes** | Warm: Ontologiql’s published edge. Cold: median+range only until shared-host. |
| **Deadline accuracy** | ClawQL: typed + group_commit + scaled bursts (first miss 250k) + restart pass. Ontologiql: `null` until same contract. |

```bash
npm run benchmark:program-density-fair
# SHARED_HOST deadline arms:
node --expose-gc --import tsx scripts/benchmarks/program-density/measure-shared-host-deadline.mjs
```

| Item | Location |
| --- | --- |
| Shared-host checklist | [`SHARED_HOST.md`](./SHARED_HOST.md) |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness | `packages/clawql-api/src/program/density/` |

## Board snapshot

| System | Status | Notes |
| --- | --- | --- |
| Ontologiql (Rust) | **Publishable** (pre-deadline) | Invite: flush disclose + crash test + scaled bursts + deadline restart |
| ClawQL (TypeScript) | **measured** (fair-v2 / v10) | typed_arrays; firstMiss=250k; restart rebuild ~40 ms; sustainablePerSec 256k |
| Golem / Infinity | Pending invite | fair-v2 / SHARED_HOST |
