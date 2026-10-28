# Durable-agent density — cross-system comparison

**Status:** Ontologiql Rust fair row is **publishable**. ClawQL TypeScript is **measured** on this board (see [`evidence-fair.json`](./evidence-fair.json)). Golem and Infinity follow on the same stable host; invite maintainers before publishing those sides.

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · memory-plateau / Bun Ready RSS is a **different** board ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — measured / publishable)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

Evidence (Ontologiql): publish with Ontologiql’s `evidence-fair.json`. Mirrored column bounds appear in this repo’s [`evidence-fair.json`](./evidence-fair.json) under `systemId: ontologiql-rust` for the comparison table only — not a ClawQL re-measurement.

## Same agent (every system)

| Field        | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| Conversation | **20 turn-pairs** of realistic size (~1–2 KiB text each turn pair) |
| Pending tool | One pending approval / tool call (~0.5 KiB JSON)                   |
| Park         | Waiting on that tool (idle durable)                                |
| Offload      | Allowed; report residence (RSS / page cache / disk / R2 / …)       |

## Same columns (every system)

| Column                               | Notes                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| Agents at the limit                  | Real ceiling on the **same host** (RSS or latency), not a soft max setting alone |
| Resident KiB / parked agent          | Process RSS — hard cost                                                          |
| Page cache KiB / agent               | Reclaimable OS hold of offloaded pages (or equivalent)                           |
| Disk (or object-store) bytes / agent | Where parked state lives                                                         |
| Wake warm p50 / p99                  | State still in page cache / hot path                                             |
| Wake cold p50 / p99                  | After cache drop / eviction — overnight case                                     |
| Restart survival                     | Parked bags (or equivalent) survive process restart                              |

**Memory framing:** resident is the floor; page cache is reclaimable. Quote the trade-off (cold wake vs warm working set), not RSS alone.

## Active density (not in public claim yet)

When measured properly, **one active agent per step** must do real work:

1. **Read** its parked state
2. **Append** one turn
3. **Park** again with the write **persisted**
4. Include a **mock model call** of **fixed latency**
5. Run at a **fixed rate per agent**
6. Ramp agent count until **p99 step latency** crosses the target

That is what readers will assume “active at 50 ms” means. Lab pulses that only touch in-memory bags without disk or a mock model belong under `activeDensityLab` and must **not** be quoted publicly.

## ClawQL TypeScript — measured

Fair parked ramp on the ClawQL TypeScript bag store (file-backed JSON, offloaded; Effect `ParkedBagService`), 512 MiB RSS-delta ceiling, same agent shape:

| Column | ClawQL TS (this evidence) |
| --- | --- |
| Agents at the limit | **200,000** (ceiling not hit; completed schedule) |
| Resident KiB / parked agent | **~0.27** (RSS delta vs empty process / N) |
| Page cache KiB / agent | **~16.4** (mincore sample, reclaimable) |
| Disk bytes / agent | **~32.8 KiB** |
| Wake warm p50 / p99 | **~0.18 ms / ~2.2 ms** |
| Wake cold p50 / p99 | **~0.16 ms / ~1.5 ms** (posix_fadvise DONTNEED) |
| Restart survival | **yes** |

Trade-off vs Ontologiql’s publishable claim: ClawQL keeps a low resident floor by offloading bags, with a larger reclaimable page-cache working set and slower wakes (JSON parse on the TS hot path). Do **not** frame this as a cross-system win — Golem/Infinity rows are still pending invite, and hosts differ until both run on the named stable host.

```bash
npm run benchmark:program-density-fair
# Smoke / smaller ramp:
CLAWQL_DENSITY_RAMP=100,500,1000 CLAWQL_DENSITY_WAKE_SAMPLE=50 npm run benchmark:program-density-fair
```

| Item     | Location                                           |
| -------- | -------------------------------------------------- |
| Evidence | [`evidence-fair.json`](./evidence-fair.json)       |
| Harness  | `packages/clawql-api/src/program/density/`         |
| Runner   | `scripts/benchmarks/program-density/run-board.mjs` |

**Honesty:** this board is **durable parked agents**, not coding-agent or gateway Ready RSS. `activeDensityLab` is unset — do not quote lab pulses as active density.

## Golem / Infinity

Same agent + same columns + same host. Invite maintainers before publishing comparison copy.

## Board snapshot

| System              | Status          | Notes                                                            |
| ------------------- | --------------- | ---------------------------------------------------------------- |
| Ontologiql (Rust)   | **Publishable** | Public claim above; mirror row in evidence                       |
| ClawQL (TypeScript) | **Measured**    | [`evidence-fair.json`](./evidence-fair.json) `clawql-typescript` |
| Golem               | Pending invite  | —                                                                |
| Infinity            | Pending invite  | —                                                                |
