# Durable-agent density — cross-system comparison

**Status:** Protocol corrected before campaign: **serial single-writer fsync ceiling** (not parallel), **binary-refined ramp** with reported resolution, 3-rep floors, alternating systems. Ontologiql compact-array rebuild **~2–3 ms** closes the rebuild format gap. Peer merge still blocked until the interleaved run. Evidence: [`evidence-fair.json`](./evidence-fair.json). Contract: [`SHARED_HOST.md`](./SHARED_HOST.md).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

Deadline accuracy remains **lab-only** until shared-host.

## Correction — fsync ceiling probe

An earlier ~41k fsync/s figure (and “256k ≈ 10% of ceiling”) used a probe that did **not** match the board’s single serial writer. Retracted as the group_commit ceiling.

| Mode                                                             | This host                                      | Role                |
| ---------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| **Serial board-matched** (append batchMax NDJSON → fsync → wait) | **~7,925** fsync/s → theo max **~507k**/s @ 64 | **PRIMARY** ceiling |
| Parallel (8 writers)                                             | ~194k fsync/s                                  | Headroom only       |

Board floor **256k ≈ 50%** of this host’s **serial** theo max — **not** disk-bound here; treat remaining gap as software headroom until drain is profiled. Ontologiql lab ~192k on a different host was also well below a parallel-style ceiling (~5.5%) for the same reason: **rerun Ontologiql on the serial probe** before calling either side disk-bound.

## Shared-host campaign protocol

| Rule                   | Detail                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Serial fsync first** | Same probe both systems; fraction of `serial.fsyncsPerSec × 64`                       |
| **Refine ramp**        | Binary search between last pass and first fail to ±few %; report `rampResolutionNote` |
| **3-rep floor**        | Headlines = min of 3 for both; never single vs floor                                  |
| **Alternate**          | ClawQL₁ → Ontologiql₁ → … on one idle host/disk                                       |
| **Then merge**         | `CLAWQL_DENSITY_PEER_JSON` when gates pass                                            |

## ClawQL TypeScript — measured (this host; pre-campaign)

| Column / check                | Value                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Agents at limit               | **2,500,000**                                                                                |
| Schedule / format             | typed_arrays; format disclosed                                                               |
| Flush / crash test            | group_commit; **pass**                                                                       |
| Scaled bursts first miss      | **250,000**                                                                                  |
| Ramp (**coarse** 3-rep floor) | sustainable **256,000**; first miss **384,000** — **refine before campaign** (band too wide) |
| Deadline restart              | **pass** — rebuild **~40–55 ms** @ 2.5e6                                                     |
| vs serial ceiling             | 256k / ~507k ≈ **50%** — software headroom on this host                                      |

## Ontologiql — lab (different host)

| Field                                         | Value                                            |
| --------------------------------------------- | ------------------------------------------------ |
| Flush / crash test                            | group_commit; **pass**                           |
| sustainablePerSec (coarse / 3 identical reps) | **192,000** — refine; true limit in (192k, 256k) |
| firstRateMissingSlaPerSec                     | **256,000**                                      |
| firstBurstSizeMissingOneSecondSla             | **200,000**                                      |
| rebuildFromDiskMs                             | **~2–3** (compact-array; was ~80)                |
| Serial fsync probe                            | **required** on shared host (same as ClawQL)     |

Coarse Ontologiql 192–256k and ClawQL 256–384k **overlap** — without refine, systems cannot be told apart.

## Shared-host five arms

| Step                                      | Status                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Serial + parallel fsync probe (this host) | done — [`fsync-ceiling.json`](./fsync-ceiling.json)                    |
| Ontologiql serial probe                   | **pending** (same pattern)                                             |
| Binary-refine ramp both sides             | ClawQL code ready (`refineRelative` default 4%); Ontologiql must match |
| Interleaved 3-rep campaign                | **pending**                                                            |
| Peer merge / win copy                     | **blocked**                                                            |

```bash
npm run benchmark:program-density-fsync-ceiling
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System              | Status                                                       | Notes                           |
| ------------------- | ------------------------------------------------------------ | ------------------------------- |
| Ontologiql (Rust)   | Publishable capacity/wake; deadline lab; rebuild **~2–3 ms** | Serial probe + ramp refine next |
| ClawQL (TypeScript) | Measured; coarse ramp 256k floor; serial ceiling ~507k theo  | Refine + campaign               |
| Golem / Infinity    | Pending invite                                               | fair-v2 / SHARED_HOST           |
