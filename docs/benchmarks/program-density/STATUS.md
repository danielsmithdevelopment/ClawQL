# Durable-agent density — cross-system comparison

**Status:** Methodology aligned (ClawQL fair-v2 / v10 + Ontologiql #144). ClawQL harness ready; **shared-host campaign protocol settled** in [`SHARED_HOST.md`](./SHARED_HOST.md) (3-rep floor, fsync ceiling first, alternating systems). Peer merge blocked until that campaign runs. Evidence: [`evidence-fair.json`](./evidence-fair.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

Deadline accuracy for Ontologiql is **methodology-closed in lab (#144)** under group_commit — not yet a shared-host public deadline claim.

## Shared-host campaign protocol (must settle before the run)

| Rule | Detail |
| --- | --- |
| **3-rep floor** | Headline `sustainablePerSec` / first-miss rates = **min of 3 reps** for **both** systems. Never compare one side’s single run to the other’s floor. |
| **Fsync ceiling first** | `npm run benchmark:program-density-fsync-ceiling` once on the shared disk before either system. Read each rate as a fraction of `fsyncsPerSec × 64`. |
| **Alternate systems** | ClawQL₁ → Ontologiql₁ → ClawQL₂ → Ontologiql₂ → ClawQL₃ → Ontologiql₃ on an otherwise idle host; same agent count; same disk. |
| **Then merge** | `CLAWQL_DENSITY_PEER_JSON=…` + fsync JSON → `sharedHostComplete` only when both have 3-rep floors and the ceiling is attached. |

## Methodology (v10 + Ontologiql #144)

| Issue | Fix |
| --- | --- |
| Flush honesty | Both: group_commit 64/10ms; lateness after fsync; SIGKILL crash test. Ontologiql’s prior ~400k/s was undeclared **os_buffer** — superseded. |
| Burst honesty | One deadline per agent; **N ≤ agentsAtLimit**. |
| Ramp honesty | Report **sustainablePerSec** + **firstRateMissingSlaPerSec** + **rampWentPastFailure**; shared-host headlines = **3-rep floor**. |
| RebuildMs | Disclose schedule format — design, not language. |
| Sustained-rate gaps | Measure fsync ceiling on the shared host; near-ceiling on both ⇒ equal / disk-bound. |

## ClawQL TypeScript — measured (this host; pre-campaign)

| Column / check | Value |
| --- | --- |
| Agents at limit | **2,500,000** |
| Schedule / format | typed_arrays; header+live NDJSON+padCount; bulk pad + bottom-up heapify |
| Flush / crash test | group_commit; **pass** |
| Steady @ ~667/s | 100% / excess p99 **~22 ms** |
| Scaled bursts first miss | **250,000** |
| Ramp (**3-rep floor**) | sustainable **256,000**; first miss **384,000**; `rampWentPastFailure=true` |
| Harness single-run snapshot | ramp pass 384k / miss 512k — **not** a headline; illustrates variance vs the floor |
| Deadline restart | **pass** — rebuild **~40–55 ms** @ 2.5e6 |

## Ontologiql — lab (#144, different host; not shared-host claim)

| Field | Value |
| --- | --- |
| Flush / crash test | group_commit; **pass** (400 ACK’d; 0 missing/dups) |
| sustainablePerSec | **128,000** (lab; remeasure as 3-rep floor on shared host) |
| firstRateMissingSlaPerSec | **192,000** (`rampWentPastFailure=true`) |
| firstBurstSizeMissingOneSecondSla | **200,000** (N = agentsAtLimit) |
| rebuildFromDiskMs | **80** @ 200k — still worth compact-array rebuild before shared-host |
| overdue / no loss / no dups | prompt 1.0; true / true |

## Shared-host five arms

| Step | Status |
| --- | --- |
| Protocol (3-rep / fsync / alternate) | **codified** in [`SHARED_HOST.md`](./SHARED_HOST.md) |
| Fsync ceiling probe (this cloud-agent host) | done — [`fsync-ceiling.json`](./fsync-ceiling.json): **41,126** fsync/s → theo max **~2.63M**/s @ batchMax=64. Board floor 256k ≈ **10%** of that ceiling (software headroom; re-measure on the campaign host). |
| Fsync ceiling on **campaign** host | **re-measure** before interleaved reps if that host ≠ this probe |
| Interleaved 3-rep campaign | **pending** |
| ClawQL harness scaffold | ready — [`shared-host-five-arms.json`](./shared-host-five-arms.json) (single-run scaffold; `peer: null`) |
| Ontologiql peer JSON | **pending** |
| Win copy | **blocked** until `reading.sharedHostComplete=true` |

```bash
npm run benchmark:program-density-fsync-ceiling
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
# Alternate Ontologiql each rep, then:
CLAWQL_DENSITY_PEER_JSON=/path/to/ontologiql-five-arms.json \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System | Status | Notes |
| --- | --- | --- |
| Ontologiql (Rust) | **Publishable** capacity/wake; deadline **lab-aligned** (#144) | Shared-host campaign next |
| ClawQL (TypeScript) | **measured** (fair-v2 / v10); headline ramp **256k 3-rep floor** | Harness ready; protocol settled |
| Golem / Infinity | Pending invite | fair-v2 / SHARED_HOST |
