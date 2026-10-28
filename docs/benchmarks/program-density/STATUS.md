# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable**. ClawQL TypeScript is **`methodology_pending`** until agents-at-limit is found under the shared **total process RSS** ceiling on a host with enough disk (or until Ontologiql remeasures on this host). Evidence: [`evidence-fair.json`](./evidence-fair.json). Golem / Infinity: invite before publishing.

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

**Shared ceiling definition:** **total process RSS** ≤ 512 MiB (not RSS-delta).

## Methodology fixes (required before any trade-off framing)

| Issue                                           | Fix in harness                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cold p99 < warm p99 (JIT contamination)         | Untimed warmup (thousands of wakes), then **both** `warm_then_cold` and `cold_then_warm`; GC pauses recorded per timed window; headline columns use `warm_then_cold` |
| ~0.27 KiB/agent from RSS-delta                  | Board column = **total RSS / N**; also `heapUsed` after forced `--expose-gc` collection; document in-process retention                                               |
| “Agents at the limit” without hitting a ceiling | Ramp until **total RSS** exceeds 512 MiB; if disk fills first, status stays `methodology_pending`                                                                    |

## ClawQL TypeScript — current evidence (v2)

Host: `clawql-cloud-agent-host`. Fair bags on disk at **N = 6,000,000** (~32.8 KiB/agent, ~197 GiB). **512 MiB total-RSS ceiling not hit** — further park would exhaust disk first. So **agents-at-limit is still unknown**.

| Column / check                                                         | Value                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| Status                                                                 | `methodology_pending`                                        |
| Agents at limit                                                        | **unknown** (largest measured N = 6e6; ceilingHit=false)     |
| Resident KiB/agent (total RSS/N, no full id index in this measure run) | ~0.021                                                       |
| heapUsed KiB/agent after forced GC                                     | ~0.0045                                                      |
| Page cache KiB/agent                                                   | ~0.21 (mincore sample)                                       |
| Disk bytes/agent                                                       | ~32.8 KiB                                                    |
| Wake warm p50/p99 (`warm_then_cold`)                                   | ~0.08 / ~0.12 ms                                             |
| Wake cold p50/p99 (`warm_then_cold`)                                   | ~0.14 / ~1.26 ms                                             |
| Other order (`cold_then_warm`) cold p99                                | ~0.56 ms (still ≥ warm)                                      |
| GC pause max in timed windows                                          | ~1.0–1.2 ms (can move a single sample; recorded in evidence) |
| Restart survival                                                       | **yes**                                                      |

**In-process retention:** bag bodies are on disk only. A **fresh park ramp** retains `agentId` strings in an in-process id index (`allIds`); during live park this host reached ~372 MiB RSS at 3e6 agents with that index. The published measure run samples wakes via `find(1)` **without** retaining N ids (so resident/N is baseline-dominated and must not be compared to Ontologiql’s ~2.6 KiB/agent as an apples-to-apples “fits more” claim).

**Wake sanity:** after warmup, **cold p99 > warm p99 in both orders**. The first published row (cold faster than warm) is superseded.

## Positioning (no comparison copy yet)

If resident figures hold under matched definitions on a shared host, the Rust case is more likely **wake speed** (Ontologiql’s sub-ms cold claim vs TS JSON wakes here) and **baseline process RSS** (~15 MB dataplane vs ~129 MB Ready) than “fits more parked agents.” **Do not write that story until shared-host remeasure.**

```bash
npm run benchmark:program-density-fair   # --expose-gc
```

| Item     | Location                                     |
| -------- | -------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json) |
| Harness  | `packages/clawql-api/src/program/density/`   |

## Golem / Infinity

Same agent + same columns + same host. Invite maintainers before publishing comparison copy.

## Board snapshot

| System              | Status                  | Notes                                                     |
| ------------------- | ----------------------- | --------------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable**         | Public claim; total-RSS ceiling                           |
| ClawQL (TypeScript) | **methodology_pending** | Wake protocol fixed; agents-at-limit unknown on this host |
| Golem               | Pending invite          | —                                                         |
| Infinity            | Pending invite          | —                                                         |
