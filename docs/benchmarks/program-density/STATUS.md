# Durable-agent density — cross-system comparison

**Status:** Methodology aligned (ClawQL fair-v2 / v10 + Ontologiql #144). Both sides: group_commit + crash test, bursts within agent count, ramp past failure, deadline restart. **Shared-host five-arm run still pending** — current numbers are different hosts. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

Deadline accuracy for Ontologiql is **methodology-closed in lab (#144)** under group_commit — not yet a shared-host public deadline claim.

## Methodology (v10 + Ontologiql #144)

| Issue                                  | Fix                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flush honesty                          | Both: group_commit 64/10ms; lateness after fsync; SIGKILL crash test. Ontologiql’s prior ~400k/s was undeclared **os_buffer** — superseded (not comparable to ClawQL’s 256k fsync floor). |
| Burst honesty                          | One deadline per agent; **N ≤ agentsAtLimit**. Ontologiql’s old 400k-at-200k used synthetic ids — superseded.                                                                             |
| Ramp honesty                           | Report **sustainablePerSec** + **firstRateMissingSlaPerSec** + **rampWentPastFailure**.                                                                                                   |
| RebuildMs                              | Disclose schedule format. Compact array + single-pass heapify vs per-entry parse/sort — design, not language.                                                                             |
| Sustained-rate gaps under group_commit | Largely **disk fsync rate** (≤ 64 × fsyncs/sec). Cross-host 256k vs 128k ≈ 4k vs 2k fsync/s — do not read as TS vs Rust.                                                                  |

## ClawQL TypeScript — measured (this host)

| Column / check           | Value                                                                       |
| ------------------------ | --------------------------------------------------------------------------- |
| Agents at limit          | **2,500,000**                                                               |
| Schedule / format        | typed_arrays; header+live NDJSON+padCount; bulk pad + bottom-up heapify     |
| Flush / crash test       | group_commit; **pass**                                                      |
| Steady @ ~667/s          | 100% / excess p99 **~22 ms**                                                |
| Scaled bursts first miss | **250,000**                                                                 |
| Ramp                     | sustainable **256,000**; first miss **384,000**; `rampWentPastFailure=true` |
| Deadline restart         | **pass** — rebuild **~40–55 ms** @ 2.5e6                                    |

## Ontologiql — lab (#144, different host; not shared-host claim)

| Field                             | Value                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| Flush / crash test                | group_commit; **pass** (400 ACK’d; 0 missing/dups)                   |
| sustainablePerSec                 | **128,000**                                                          |
| firstRateMissingSlaPerSec         | **192,000** (`rampWentPastFailure=true`)                             |
| firstBurstSizeMissingOneSecondSla | **200,000** (N = agentsAtLimit)                                      |
| rebuildFromDiskMs                 | **80** @ 200k — still worth compact-array rebuild before shared-host |
| overdue / no loss / no dups       | prompt 1.0; true / true                                              |

## Before / during shared-host

1. **Expect sustained rates to be fsync-bound** on the shared disk; the current 2× gap may shrink or vanish.
2. **Ontologiql rebuild format:** if still per-entry parse/sort, compact binary + single-pass heapify should close 80 ms @ 200k vs ClawQL ~50 ms @ 2.5e6.
3. Run all **five arms** on one host ([SHARED_HOST.md](./SHARED_HOST.md)). **No win copy** until then.

```bash
npm run benchmark:program-density-fair
node --expose-gc --import tsx scripts/benchmarks/program-density/measure-shared-host-deadline.mjs
node --expose-gc --import tsx scripts/benchmarks/program-density/measure-ramp-past-failure.mjs
```

## Board snapshot

| System              | Status                                                         | Notes                                                    |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** capacity/wake; deadline **lab-aligned** (#144) | Shared-host five arms next; rebuild format optional tune |
| ClawQL (TypeScript) | **measured** (fair-v2 / v10)                                   | firstMiss=250k; ramp 256k→miss 384k; restart ~40–55 ms   |
| Golem / Infinity    | Pending invite                                                 | fair-v2 / SHARED_HOST                                    |
