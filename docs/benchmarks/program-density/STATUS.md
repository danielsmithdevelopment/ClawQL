# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable**. ClawQL TypeScript is **`measured`** on this host: agents-at-limit = first resource exhausted (**disk** at 6e6). Evidence: [`evidence-fair.json`](./evidence-fair.json). Golem / Infinity: invite before publishing.

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared definitions:** **total process RSS** ceiling; **agents-at-limit** = first resource exhausted (`disk` | `rss` | `latency`).

## Methodology (v3)

| Issue                          | Fix in harness                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cold p99 varies by wake order  | Untimed warmup, then **alternate** `warm_then_cold` / `cold_then_warm` for **N repetitions**; report cold/warm p99 **spread**; headline = **slower** cold order (`coldP99Max`) |
| RSS-delta understates resident | Board column = **total RSS / N**; also `heapUsed` after forced `--expose-gc`; document in-process retention                                                                    |
| Disk fills before RSS ceiling  | Agents-at-limit = **first resource exhausted** (disk counts). On this host disk binds at 6e6 before 512 MiB total RSS                                                          |

## ClawQL TypeScript — current evidence (v3)

Host: `clawql-cloud-agent-host`. Fair bags on disk at **N = 6,000,000** (~32.8 KiB/agent). **Disk** is the binding limit (total RSS ~127 MiB ≪ 512 MiB; flat growth without a full id index). Status **`measured`**.

| Column / check                                                      | Value                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Status                                                              | `measured`                                                                        |
| Agents at limit                                                     | **6,000,000** (`limitResource=disk`)                                              |
| Resident KiB/agent (total RSS/N, measure run without full id index) | ~0.021                                                                            |
| Live-park RSS with id index                                         | ~372 MiB at 3e6 (~130 B/agent class, baseline included)                           |
| heapUsed KiB/agent after forced GC                                  | ~0.0046                                                                           |
| Page cache KiB/agent                                                | ~0.09 (mincore sample)                                                            |
| Disk bytes/agent                                                    | ~32.8 KiB (Ontologiql ~30 KiB — similar; both hit disk at similar N on this host) |
| Wake headline order                                                 | `warm_then_cold` (slower cold `coldP99Max`)                                       |
| Wake warm / cold p99 (headline = max-cold rep)                      | ~0.36 / ~0.68 ms                                                                  |
| Cold p99 spread (`warm_then_cold`, 3 reps)                          | 0.51–0.68 ms (median ~0.66)                                                       |
| Cold p99 spread (`cold_then_warm`, 3 reps)                          | 0.39–0.56 ms (median ~0.47)                                                       |
| Restart survival                                                    | **yes**                                                                           |

**In-process retention:** TS keeps an **id-index entry** per parked agent; bag body on disk. That is why measured resident can undercut Ontologiql’s ~2 KiB/agent — not a Rust defeat. Ontologiql only needs id + bag locator for a parked agent; trimming the in-memory struct is the optimization. **Do not** use “fits more agents” copy; Ontologiql’s measured edges here are **wake speed** and **baseline process RSS**.

**Wake sanity:** after warmup, this measure run has **cold p99 > warm p99 in every timed window**. Order still moves cold p99 (~1.2–1.4× between order medians here; earlier single-pass was >2×). Multi-rep spread is the recorded answer; headline uses the slower order’s worst cold p99.

```bash
npm run benchmark:program-density-fair   # --expose-gc
# Multi-rep measure on existing bags:
# CLAWQL_DENSITY_REUSE_BAGS=1 CLAWQL_DENSITY_RESUME_FROM=6000000 \
# CLAWQL_DENSITY_RAMP=6000000 CLAWQL_DENSITY_WAKE_ORDER_REPS=3 \
# CLAWQL_DENSITY_BAG_DIR=/tmp/clawql-density-bags-fair npm run benchmark:program-density-fair
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Positioning (no “fits more agents”)

Until Ontologiql trims parked-agent records, a shared-host board may show TypeScript lower resident/agent. That is retention shape, not a memory-law win. Quote later: **wake speed** (Ontologiql warm ~33 µs / cold ~0.6 ms vs TS JSON wakes here) and **baseline process RSS** — not density-of-fit.

## Golem / Infinity

Same agent + same columns + same host. Invite maintainers before publishing comparison copy.

## Board snapshot

| System              | Status          | Notes                                             |
| ------------------- | --------------- | ------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** | Public claim; `limitResource=rss` at 200k         |
| ClawQL (TypeScript) | **measured**    | `limitResource=disk` at 6e6; wake spread recorded |
| Golem               | Pending invite  | —                                                 |
| Infinity            | Pending invite  | —                                                 |
