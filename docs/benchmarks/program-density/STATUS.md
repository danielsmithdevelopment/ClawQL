# Durable-agent density — cross-system comparison

**Status:** Short ramp steps were overstating the 1s-SLA rate (ClawQL printed 636k against a ~321k drain). **Fixed:** continuous-arrival steps with backlog trend; fail when overdue depth grows. Remeasure: **durable ~347k/s**, **sustained ~140k/s** (≤ drain). Evidence: [`drain-vs-sustained.json`](./drain-vs-sustained.json).

**Related:** [durability-proof STATUS](../durability-proof/STATUS.md) · Ready RSS boards are different ([memory-plateau.md](../cloudflare-multiturn/memory-plateau.md)).

## Public claim (Ontologiql — publishable capacity/wake; deadlines = lab until shared-host)

> On one node, Ontologiql held 200,000 parked agents, each with a 20-turn history and a pending tool call, within a 512 MiB process memory ceiling, with state stored on disk at about 30 KiB per agent. A parked agent woke in under 0.6 ms at p99 with a cold cache, and under 35 µs with its state cached. Parked agents survived a restart.

## Ramp honesty (both systems)

A sustained arrival rate **cannot** exceed durable drain — backlog would grow without bound. Short steps (1–2s) hide that: lateness reaches 1s only after ~1s of growth, so the step still “passes.”

| Rule          | Requirement                                                                                |
| ------------- | ------------------------------------------------------------------------------------------ |
| Step duration | Continuous arrivals for **≥30s** (campaign); smoke may use 8s                              |
| Fail if       | overdue backlog still **growing** in the final stretch — even when pctWithinSla looks fine |
| Evidence      | `stepDurationMs` + `backlogTrend` on every ramp arm                                        |

## Two board numbers (ClawQL, this host, 8s smoke steps)

| Number                                           | Result                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| **durableRecordsPerSec** (saturating continuous) | **~347k/s**                                                  |
| **rateSustainableWithinOneSecondSla**            | **~140k/s** (first fail ~144k on growing backlog @ 100% SLA) |
| drain / sustained                                | **~2.5** → latency limit once the ramp is honest             |

Diagnosis: `latency_limit_drain_exceeds_sustained_sla_rate`. Prior 636k figure **retracted** (short place-ahead ramp).

## Cycle stages (drain window)

| Stage           | Mean    | p50                   |
| --------------- | ------- | --------------------- |
| write           | ~10 µs  | ~9 µs                 |
| sync            | ~125 µs | ~111 µs (p99 ~672 µs) |
| ack             | ~2 µs   | ~2 µs                 |
| inter-flush gap | ~0.4 µs | —                     |

ClawQL ack stays tiny vs Ontologiql’s ~141 µs/batch. Record sync **p99** beside mean (Ontologiql mean 252 vs p50 100).

## Prealloc / journal config

| System     | Best on its host                                             |
| ---------- | ------------------------------------------------------------ |
| ClawQL     | fsync append (~+3% for prealloc here)                        |
| Ontologiql | fdatasync + 256 MiB prealloc (~+31%) — disclose on shared FS |

## Shared-host campaign

```bash
CLAWQL_DENSITY_RAMP_STEP_MS=30000 \
  npm run benchmark:program-density-drain-vs-sustained
CLAWQL_DENSITY_REPS=3 \
CLAWQL_DENSITY_FSYNC_CEILING_JSON=docs/benchmarks/program-density/fsync-ceiling.json \
  npm run benchmark:program-density-shared-host
```

## Board snapshot

| System           | Status                                              | Notes                        |
| ---------------- | --------------------------------------------------- | ---------------------------- |
| Ontologiql       | Drain≈SLA (~0.85); between_syncs_ack_write_material | Same steady-state ramp rules |
| ClawQL           | Steady-state ramp; sustained ≤ drain; latency-bound | Campaign-ready               |
| Golem / Infinity | Pending invite                                      | fair-v2 / SHARED_HOST        |
