# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable** on the pre-deadline contract (`deadlineLatenessMs` pending remeasure). ClawQL TypeScript is **`measured`** under **fair-v2**: wake-deadline schedule retained at limit; first resource = **`rss` at 2.25e6**. Evidence: [`evidence-fair.json`](./evidence-fair.json). Golem / Infinity: invite before publishing.

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions (fair-v2):** total process RSS ceiling; agents-at-limit = first resource exhausted; retained at limit = **wake-deadline schedule** (path derived from agentId — FS is the id index); **deadlineLatenessMs** required.

## Methodology (v5)

| Issue | Fix |
| --- | --- |
| Id/path Maps are shrinkable | Path is derived; neither side needs to store it. ~0.62 KiB TS Map overhead and ~2 KiB Ontologiql records can both drop toward tens of bytes. **Then capacity is disk-bound and bag size decides** (~30 vs ~32.8 KiB). |
| Fair agent needed real in-memory state | Every agent has `wakeDeadlineAt` (randomly spread). Systems retain a deadline schedule and must fire on time → **`deadlineLatenessMs` p50/p99**. |
| Cold p99 jumped 0.68→1.79 ms across runs | Quote **median + range** across order repetitions. **Do not** read cross-system cold gaps until shared-host. |

## ClawQL TypeScript — current evidence (v5 / fair-v2)

Host: `clawql-cloud-agent-host`. Bags on disk: 6e6 (~32.8 KiB/agent). Limit run retains a **deadline min-heap** for every counted agent.

| Column / check | Value |
| --- | --- |
| Status | `measured` |
| Agents at limit | **2,250,000** (`limitResource=rss`) |
| Deadline schedule entries | **2,250,000** |
| Resident KiB/agent | ~0.22 |
| Disk bytes/agent | ~32.8 KiB |
| Deadline lateness p50/p99 (2000 bag fires) | ~278 / ~526 ms |
| Wake warm p99 (headline-order **median**) | ~0.19 ms |
| Wake cold p99 (**median**; range) | ~1.39 ms (1.24–6.05 across `warm_then_cold` reps) |
| Restart survival | **yes** |

**Superseded:** v3 disk@6e6 without index; v4 id→path Map@750k (index-only resident, no deadline contract).

## Provisional positioning (different hosts — shared-host before any win)

| Column | Reading |
| --- | --- |
| **Capacity** | Index/path trim on **both** sides likely converges on **disk / bag size** (~30 vs ~32.8 KiB), not the current resident gap. Deadline schedule is the resident that survives that trim. |
| **Warm wakes** | Still Ontologiql’s clearest edge on published numbers (~33 µs vs TS ~0.19 ms median here). |
| **Cold wakes** | **Do not compare** until shared-host — host variance dominates (median+range only). |
| **Deadline accuracy** | New column. TS lateness p99 ~526 ms at 2k fires / 3s horizon under a 2.25e6 schedule — Ontologiql not yet measured. |

**Ontologiql’s case until deadline remeasure:** warm-wake speed and baseline process RSS. Capacity after mutual locator trim is a bag-size race. Invite Ontologiql to fair-v2 deadline + shared-host.

```bash
npm run benchmark:program-density-fair   # --expose-gc
# CLAWQL_DENSITY_REUSE_BAGS=1 CLAWQL_DENSITY_RESUME_FROM=6000000 \
# CLAWQL_DENSITY_RAMP=6000000 CLAWQL_DENSITY_WAKE_ORDER_REPS=3 \
# CLAWQL_DENSITY_DEADLINE_HORIZON_MS=3000 CLAWQL_DENSITY_DEADLINE_MAX_FIRES=2000 \
# CLAWQL_DENSITY_BAG_DIR=/tmp/clawql-density-bags-fair \
# NODE_OPTIONS=--max-old-space-size=8192 npm run benchmark:program-density-fair
```

| Item | Location |
| --- | --- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness | `packages/clawql-api/src/program/density/` |

## Golem / Infinity

Same agent + same columns + same host (fair-v2 deadlines). Invite before publishing.

## Board snapshot

| System | Status | Notes |
| --- | --- | --- |
| Ontologiql (Rust) | **Publishable** (pre-deadline) | `deadlineLatenessMs=null` until remeasure |
| ClawQL (TypeScript) | **measured** (fair-v2) | rss@2.25e6 with deadline schedule; lateness measured |
| Golem | Pending invite | — |
| Infinity | Pending invite | — |
