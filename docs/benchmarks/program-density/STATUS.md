# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineAccuracy` pending). ClawQL TypeScript is **`measured`** under **fair-v2** with a corrected deadline column (scheduler tick recorded; excess-over-tick + steady/burst under a shared 1s SLA). Evidence: [`evidence-fair.json`](./evidence-fair.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule**; **deadlineAccuracy** = shared SLA (fire within 1s) with % met + p99 excess-over-tick under **steady** and **burst**. Scheduler tick/mechanism must be recorded. Design (timer wheel vs heap) is free.

## Methodology (v6 — deadline column fixed)

| Issue                                | Fix                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw lateness mirrored a poll setting | Scheduler is **setTimeout-to-next-deadline** (no fixed half-second poll). Evidence records `mechanism` + `tickMs` (1 ms attributed OS grain). |
| Column must measure load             | Report **excess-over-tick** = max(0, lateness − tickMs).                                                                                      |
| Need a stress shape                  | **Burst:** thousands of deadlines due at the same instant (batch approval expiry).                                                            |
| Fair comparison                      | Shared requirement: **fire within 1 second**. Board: `% met` + p99 excess under steady and burst.                                             |

## ClawQL TypeScript — current evidence (v6)

Host: `clawql-cloud-agent-host`. Deadline schedule retained at limit.

| Column / check                                  | Value                                                |
| ----------------------------------------------- | ---------------------------------------------------- |
| Status                                          | `measured`                                           |
| Agents at limit                                 | **2,500,000** (`limitResource=rss`)                  |
| Deadline schedule entries                       | **2,500,000**                                        |
| Resident KiB/agent                              | ~0.21                                                |
| Disk bytes/agent                                | ~32.8 KiB                                            |
| Scheduler                                       | `min_heap_setTimeout_to_next_deadline`, tickMs=1     |
| Deadline SLA                                    | **1000 ms**                                          |
| Steady % met / p99 excess                       | **29.5%** / **4375 ms** (2000 fires, spread horizon) |
| Burst % met / p99 excess                        | **100%** / **707 ms** (2000 same-instant)            |
| Wake warm p99 (median)                          | ~0.21 ms                                             |
| Wake cold p99 (median; range on headline order) | see `wakeSpread` — quote median+range only           |
| Restart survival                                | **yes**                                              |

**Superseded:** prior ~278/526 ms “lateness” row (looked like a ~500 ms poll; not comparable).

**Reading the deadline numbers:** With tickMs=1, excess ≈ raw load. Burst p99 ~707 ms is serial bag-wake drain of 2k same-instant deadlines (all still within the 1s SLA). Steady is harsher here (spread deadlines + wake work under a 2.5e6 resident schedule) — only ~30% met the 1s SLA; that is the load column, not a tick artifact. Half-second class lateness remains fine for minute-scale approval expiries; the board still needs the SLA/%/excess shape before Ontologiql sits beside it.

## Provisional positioning (different hosts — shared-host before any win)

| Column                | Reading                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Capacity**          | After mutual locator trim → disk/bag-size (~30 vs ~32.8 KiB). Deadline schedule is the surviving resident.      |
| **Warm wakes**        | Ontologiql’s clearest published edge.                                                                           |
| **Cold wakes**        | Do not compare until shared-host (median+range only).                                                           |
| **Deadline accuracy** | Shared 1s SLA; TS measured steady+burst with tick recorded. Ontologiql `deadlineAccuracy=null` until remeasure. |

```bash
npm run benchmark:program-density-fair
# CLAWQL_DENSITY_DEADLINE_SLA_MS=1000 CLAWQL_DENSITY_DEADLINE_MAX_FIRES=2000 ...
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Board snapshot

| System              | Status                         | Notes                                             |
| ------------------- | ------------------------------ | ------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** (pre-deadline) | `deadlineAccuracy=null` until fair-v2 remeasure   |
| ClawQL (TypeScript) | **measured** (fair-v2)         | rss@2.5e6; steady+burst SLA scored; tick recorded |
| Golem / Infinity    | Pending invite                 | fair-v2 deadlines                                 |
