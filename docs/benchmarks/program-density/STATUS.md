# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineAccuracy` pending). ClawQL TypeScript is **`measured`** under **fair-v2 / methodology v10** — flush policy + crash test, typed-array schedule + GC A/B, SHARED_HOST scaled bursts + deadline restart, with **schedule format disclosed** on the rebuild column. Shared-host run still pending. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule**; **deadlineAccuracy** = shared SLA (fire within 1s) with identical **fired definition**, identical **flush policy** (or disclose), **schedule shape + format**, **scaled bursts** (first miss; N ≤ agentsAtLimit unless explained), **deadline restart**, arrival-rate ramp (disclose stop-at-first-miss vs past-failure), concurrent fires, O(log n) next-deadline, **sustainablePerSec**, and a **flush crash test**.

## Methodology (v10 — SHARED_HOST deadline arms)

| Issue | Fix |
| --- | --- |
| Flush honesty | Explicit policy; lateness after fsync; SIGKILL mid-drain crash test (v8). |
| ~300 ms steady tail | GC A/B on object heap; board default **typed_arrays** (v9). |
| Burst size vs Ontologiql | **Scaled bursts** at 512 / 10k / 100k / …; headline = **first size that misses** the 1s SLA. |
| Deadlines across restart | Persist → SIGKILL → downtime → **rebuildMs** + overdue catch-up; **disclose schedule format**. |
| RebuildMs as language war | Record on-disk + rebuild path. ClawQL: live NDJSON + padCount; in-memory Float64/Int32; **bulk pad + bottom-up heapify**. Peer parse/sort is a cheap format fix, not Rust vs TS. |

## ClawQL TypeScript — current evidence (v10)

Host: `clawql-cloud-agent-host`. Resident heap pad **2.5e6**. Flush = **group_commit** (64 / 10 ms). Schedule = **`typed_arrays`**.

| Column / check | Value |
| --- | --- |
| Status | `measured` |
| Agents at limit | **2,500,000** (`limitResource=rss`) |
| Schedule shape / format | **typed_arrays** — on-disk header+live NDJSON+padCount; rebuild = bulk pad + bottom-up heapify |
| Flush / crash test | group_commit; **pass** |
| Steady @ ~667/s | 100% met / excess p99 **~22 ms** |
| **Scaled bursts first miss** | **250,000** (512 / 10k / 100k met 100%; 250k → 63% met) — N ≤ agentsAtLimit |
| **Deadline restart** | **pass** — rebuild **~40–55 ms** @ 2.5e6; overdue catch-up ok; no loss/duplicates |
| **sustainablePerSec** | **256,000** (typed + group_commit; 3-rep floor; ramp **stops at first miss**) |
| Object-heap A/B | excess p99 ~314 ms; major GC ~121 ms; 100% late∩major-GC |

**Reading rebuildMs:** ClawQL ~40–55 ms @ 2.5e6 vs a peer ~86 ms @ 200k is not a TS-vs-Rust verdict until both disclose format. Compact typed arrays + single-pass heapify vs per-entry parse/sort explains order-of-magnitude gaps.

## Ontologiql — still open before columns sit together

| Open item | Ask |
| --- | --- |
| Flush policy + crash test | Disclose policy; SIGKILL mid-drain proof. |
| 400k burst @ 200k agents | Explain how deadlines > agents fell due at once, **or** rerun ladder with N ≤ agentsAtLimit. |
| Sustained-rate ramp | Confirm whether the ramp continued **past** the first failure (result matched the burst cliff exactly — ambiguous without a post-failure sample). |
| Schedule format on restart | Disclose on-disk layout + rebuild algorithm next to rebuildMs. |

Then both run the **same five arms on one host** ([SHARED_HOST.md](./SHARED_HOST.md)). No win copy until then.

## Provisional positioning (different hosts)

| Column | Reading |
| --- | --- |
| **Capacity** | After mutual locator trim → disk/bag-size (~30 vs ~32.8 KiB). |
| **Warm / cold wakes** | Warm: Ontologiql’s published edge. Cold: median+range only until shared-host. |
| **Deadline accuracy** | ClawQL measured (format disclosed). Ontologiql opens above. |

```bash
npm run benchmark:program-density-fair
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
| Ontologiql (Rust) | **Publishable** (pre-deadline) | Opens: flush/crash, 400k@200k burst, ramp past-failure, schedule format |
| ClawQL (TypeScript) | **measured** (fair-v2 / v10) | format disclosed; firstMiss=250k; restart ~40–55 ms; sustainablePerSec 256k |
| Golem / Infinity | Pending invite | fair-v2 / SHARED_HOST |
