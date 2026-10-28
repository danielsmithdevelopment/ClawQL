# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable**. ClawQL TypeScript is **`measured`** with a **wake-by-id index retained** at limit: first resource exhausted = **`rss` at 750,000** (512 MiB total process RSS). Evidence: [`evidence-fair.json`](./evidence-fair.json). Golem / Infinity: invite before publishing.

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions:** **total process RSS** ceiling; **agents-at-limit** = first resource exhausted (`disk` | `rss` | `latency`); limit runs **must** retain wake-by-id in-memory state for every counted agent (Ontologiql’s per-agent record equivalent).

## Methodology (v4)

| Issue                          | Fix in harness                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 6e6 “disk” run at ~127 MiB RSS | That run **omitted** the per-agent index (find-sample only). **Not comparable.** Superseded.                                  |
| Working-system state           | Limit runs retain `Map<agentId, bagPath>` for every counted agent; `idIndexEntries === agentsAtLimit` required for `measured` |
| Cold p99 varies by wake order  | Untimed warmup + **N×** order alternation; report spread; headline = slower cold order (`coldP99Max`)                         |
| Disk vs RSS                    | First resource exhausted; with index retained, this host hits **RSS** before disk                                             |

## ClawQL TypeScript — current evidence (v4, index retained)

Host: `clawql-cloud-agent-host`. Bags on disk: 6e6 (~32.8 KiB/agent). **Indexed limit:** load wake-by-id Map until total RSS would exceed 512 MiB → **750k within ceiling** (overshoot checkpoint 1e6 @ ~564 MiB). Status **`measured`**, `limitResource=rss`, `idIndexRetainedAtLimit=true`.

| Column / check                                          | Value                                       |
| ------------------------------------------------------- | ------------------------------------------- |
| Status                                                  | `measured`                                  |
| Agents at limit                                         | **750,000** (`limitResource=rss`)           |
| Id index entries                                        | **750,000** (`agentId → bagPath`)           |
| Resident KiB/agent (total RSS/N at within-ceiling step) | ~0.62 (~630 B/agent class)                  |
| heapUsed KiB/agent after GC                             | ~0.44                                       |
| Disk bytes/agent                                        | ~32.8 KiB                                   |
| Wake headline order                                     | `warm_then_cold` (slower cold `coldP99Max`) |
| Wake warm / cold p99 (headline)                         | ~0.14 / ~1.79 ms                            |
| Cold p99 spread (`warm_then_cold`, 3 reps)              | 1.00–1.79 ms                                |
| Cold p99 spread (`cold_then_warm`, 3 reps)              | 0.57–1.78 ms                                |
| Restart survival                                        | **yes**                                     |

**Superseded (do not quote):** the v3 “disk at 6e6 / ~127 MiB” row — no per-agent index.

## Provisional positioning (different hosts — shared-host remeasure before any win)

| Column         | Reading on this evidence                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capacity**   | TypeScript ahead (750k vs Ontologiql 200k) because resident/agent is ~0.6 KiB vs ~2 KiB. **Trimming Ontologiql’s parked record is the capacity lever**, not a nicety. |
| **Cold wakes** | Roughly even / disk-bound ballpark (TS headline ~1.8 ms p99 vs Ontologiql ~0.58 ms; order spread is large).                                                           |
| **Warm wakes** | Ontologiql ahead (~33 µs vs TS ~140 µs here — about 4× on this run; earlier non-index runs showed ~10× at ~360 µs).                                                   |

**Ontologiql’s case on this board:** warm-wake speed and baseline process RSS. Capacity joins that story only after the per-agent record is trimmed. **No cross-system win copy until shared-host remeasure.**

```bash
npm run benchmark:program-density-fair   # --expose-gc
# Indexed measure on existing bags:
# CLAWQL_DENSITY_REUSE_BAGS=1 CLAWQL_DENSITY_RESUME_FROM=6000000 \
# CLAWQL_DENSITY_RAMP=6000000 CLAWQL_DENSITY_WAKE_ORDER_REPS=3 \
# CLAWQL_DENSITY_BAG_DIR=/tmp/clawql-density-bags-fair \
# NODE_OPTIONS=--max-old-space-size=8192 npm run benchmark:program-density-fair
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Golem / Infinity

Same agent + same columns + same host. Invite maintainers before publishing comparison copy.

## Board snapshot

| System              | Status          | Notes                                                                          |
| ------------------- | --------------- | ------------------------------------------------------------------------------ |
| Ontologiql (Rust)   | **Publishable** | Public claim; `limitResource=rss` at 200k; ~2 KiB/agent trim candidate         |
| ClawQL (TypeScript) | **measured**    | `limitResource=rss` at 750k **with** wake-by-id Map; provisional vs Ontologiql |
| Golem               | Pending invite  | —                                                                              |
| Infinity            | Pending invite  | —                                                                              |
