# Durable-agent density — cross-system comparison

**Status:** Methodology aligned (ClawQL fair-v2 / v10 + Ontologiql #144). ClawQL **five-arm harness artifact** ready ([`shared-host-five-arms.json`](./shared-host-five-arms.json)); merged into evidence as `sharedHostFiveArms` (`peer: null`). Ontologiql peer row **not yet merged** — shared-host complete only when both run on one machine. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

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

## Shared-host five arms

| Step                                                                      | Status                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ClawQL five-arm harness (`npm run benchmark:program-density-shared-host`) | **done** on this host → [`shared-host-five-arms.json`](./shared-host-five-arms.json) (`peer: null`) |
| Ontologiql peer JSON on the **same** host                                 | **pending** — merge via `CLAWQL_DENSITY_PEER_JSON=…`                                                |
| Win copy                                                                  | **blocked** until `reading.sharedHostComplete=true`                                                 |

ClawQL harness snapshot (this host; single run — board still quotes the conservative 256k 3-rep floor): firstBurstMiss **250k**; ramp pass **384k** / miss **512k** (variance vs 256k floor shows fsync-bound noise); crash **pass**; restart rebuild **45 ms**.

Before peer merge: expect sustained rates to converge under one disk; Ontologiql compact-array rebuild still optional.

```bash
npm run benchmark:program-density-shared-host
# After Ontologiql writes peer JSON on this host:
CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json npm run benchmark:program-density-shared-host
```

## Board snapshot

| System              | Status                                                         | Notes                                                    |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** capacity/wake; deadline **lab-aligned** (#144) | Shared-host five arms next; rebuild format optional tune |
| ClawQL (TypeScript) | **measured** (fair-v2 / v10)                                   | firstMiss=250k; ramp 256k→miss 384k; restart ~40–55 ms   |
| Golem / Infinity    | Pending invite                                                 | fair-v2 / SHARED_HOST                                    |
