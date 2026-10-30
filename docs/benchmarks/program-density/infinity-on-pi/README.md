# Infinity × ClawQL density harness (Pi deferred)

Time-sensitive follow-up while Infinity’s public density post is discussed. **Independent of** `durability-pilot-v1`.

Infinity: [hydro-project/infinity](https://github.com/hydro-project/infinity) · [AWS blog](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/)

**Framing:** same-host harness now; Raspberry Pi 5 as an extra column later. This cloud-agent host is a **KVM VM** → all numbers here are `publishable: false`.

| Field         | Value                                                           |
| ------------- | --------------------------------------------------------------- |
| Host kind     | `cloud-agent-kvm-vm` (Hypervisor=KVM, Xeon, 4 vCPU, ~15.6 GiB)  |
| Instance type | unknown (no cloud metadata endpoint)                            |
| Storage       | ephemeral pod disk                                              |
| `publishable` | **false**                                                       |
| Contract      | `infinity-agent-scale-matched-v2` (unique-per-agent text)       |
| Cgroup        | `memory.max=8G`, **`memory.swap.max=0`** (swap peak verified 0) |

## Gates

1. **Byte parity** — matching Infinity-shaped 20-turn / 100-message histories (~65 KiB JSON each side). fair-v2’s ~33 KiB was a different workload.
2. **Unique content** — every agent/turn/slot tagged so V8 cannot share strings across agents.
3. **History integrity** — resident slope (and offloaded disk KiB) ≥ serialized history KiB.
4. **Fit-cap integrity** — `lastFitAgents × rampSlope ≤ memory.max` (catches overstated slopes / swap).
5. **Harness×lastFit cross-check** — uncapped harness floor × 8G lastFit must also fit, or those two numbers must not be quoted together.
6. **Fit quality** — at lastFit, per-turn latency p50/p99 within **2×** of low-N baseline (else report highest N that qualifies).

## Headline metric: agents that fit under 8 GiB (measured)

**Do not** lead with open-host slope × cap. Extrapolating ClawQL’s open-host ~100 KiB slope undercounts fit by ~25%; Infinity’s open-host slope predicts its 8 G fit well. Under the cap ClawQL collects/compacts harder (~79 KiB/agent); Infinity barely changes (~105 KiB).

| System          | lastFit (no swap) | RSS/N at lastFit | vs Infinity lastFit      |
| --------------- | ----------------- | ---------------- | ------------------------ |
| Infinity        | **77 500**        | **~105.3 KiB**   | —                        |
| ClawQL resident | **102 500**       | **~78.9 KiB**    | **~32% more agents**     |

Paired per-agent figure = **RSS at lastFit / N** (same definition both sides). Cgroup `memory.peak` often saturates at `memory.max` during GC spikes — prefer RSS/N for the quote; peak/N is an upper bound.

Evidence: [`infinity-8g-ramp.json`](./infinity-8g-ramp.json) · [`clawql-resident-8g-ramp.json`](./clawql-resident-8g-ramp.json)

### Fit quality (turn latency under the cap)

Probed after the population is resident: baseline **N=2 500**, then at lastFit (ClawQL quality-checked at **100 000** — within ~2.4% of ramp lastFit 102.5k; Infinity at **77 500**). Ceiling = **2×** baseline p50 and p99.

| System   | Baseline turn p50 / p99     | At lastFit p50 / p99        | Within 2×? | Throughput (turns/s) |
| -------- | --------------------------- | --------------------------- | ---------- | -------------------- |
| Infinity | 2.78 ms / 3.89 ms           | 3.06 ms / 4.05 ms           | **yes**    | ~313 → ~316          |
| ClawQL   | 0.025 ms / 0.051 ms         | 0.023 ms / 0.086 ms         | **yes**    | ~35k → ~38k          |

Absolute ms are **not** cross-system comparable (Infinity = full runtime round-trip; ClawQL harness = matched-shape `driveTurn` append). Within-system 2× gate is the quality check. **highestNWithin2x** = lastFit for both on this host.

Evidence: [`evidence-infinity-fit-latency.json`](./evidence-infinity-fit-latency.json) · [`evidence-clawql-fit-latency.json`](./evidence-clawql-fit-latency.json)

### Tuning disclosure (fair operator)

| System   | Flags / allocator                                                                 | Notes |
| -------- | --------------------------------------------------------------------------------- | ----- |
| ClawQL   | **`--expose-gc --max-old-space-size=8192`**                                       | Required so V8 old-space can use the 8 GiB cgroup; default heap aborts the ramp early. |
| Infinity | glibc **malloc** + **`malloc_trim(0)`** after each wave; **no** jemalloc/mimalloc / `MALLOC_*` env | Matches stock `agent_scale`. |

**Question for Infinity / Shadaj Laddad’s team:** under an 8 GiB hard cap, should a fair density operator set an allocator or heap analog to ClawQL’s required `--max-old-space-size=8192` (jemalloc/mimalloc arenas, glibc `M_TRIM_THRESHOLD` / `MALLOC_ARENA_MAX`, etc.)? If yes, which knobs and what defaults would you want quoted beside their 75k@8 GB line?

## Resident comparison (open host, forced full GC)

| System          | Slope floor (KiB/agent) | History   | Overhead (slope − history) |
| --------------- | ----------------------- | --------- | -------------------------- |
| Infinity        | **102.891**             | ~63.9 KiB | **~39 KiB**                |
| ClawQL resident | **100.221**             | ~63.1 KiB | **~37 KiB**                |

Roughly equal on an open host — and that equality **mis-predicts** 8 G fit for ClawQL (see headline). Samples use `--expose-gc` + multi-pass `gc()` before each RSS read.

Evidence: [`evidence-harness-v2.json`](./evidence-harness-v2.json) · `integrityOk: true`

## 8 GB ramp detail (not a Pi)

Process born inside cgroup; **`memory.swap.max=0`** (swap peak verified 0).

| System          | Last sample before OOM | Ramp slope | RSS/N at lastFit | Fit-cap (ramp)    | Harness×lastFit     |
| --------------- | ---------------------- | ---------- | ---------------- | ----------------- | ------------------- |
| Infinity        | **77 500**             | **102.9**  | **~105 KiB**     | **ok** (7.61 GiB) | **ok** (7.61 GiB)   |
| ClawQL resident | **102 500**            | **75.9**   | **~78.9 KiB**    | **ok** (7.42 GiB) | **fail** (9.80 GiB) |

ClawQL’s uncapped harness slope (~100 KiB) **overstates** cost under the 8 G ceiling. Quote **measured lastFit + RSS/N**, not harness floor × lastFit. Infinity’s public **75k @ 8 GB** line remains close to measured **77.5k** here.

## Offloaded trade-off (separate row — not a same-terms win)

ClawQL offloaded keeps history on disk (~65.9 KiB/agent bag) with ~**1 KiB** process RSS slope (ids-only). That is a **different product shape**, not a denser Infinity. Measured on this KVM host (`publishable: false`, 500 parked agents, 200 wake sample × 3 order reps):

| Cost / property      | ClawQL offloaded (measured)                           | Closest Infinity analogue                            |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Resident RSS / agent | ~1 KiB (ids-only slope)                               | In-memory idle ~103 KiB (their `agent_scale`)        |
| Durable history      | **~65.9 KiB** disk / agent (`dens_*.json`)            | Serverless / external store path (not measured here) |
| Page cache           | **~68 KiB/agent** (mincore after park)                | N/A for pure in-memory bench                         |
| Warm wake            | **p50 ≈ 0.10 ms**, p99 ≈ 0.27 ms (read+parse+restore) | Warm store hit / in-process reload                   |
| Cold wake            | **p50 ≈ 0.20 ms**, p99 ≈ 0.96 ms (after `DONTNEED`)   | Cold start / store fetch (their serverless story)    |

Present offloaded **beside** Infinity’s serverless/external-store mode as the fair pairing — not against in-memory `agent_scale`. No win copy on the resident column.

Evidence: [`evidence-offloaded-tradeoff.json`](./evidence-offloaded-tradeoff.json)

## Commands

```bash
# Uncapped Infinity slope
AGENTS=20000 WAVE=2000 REP=1 npm run benchmark:infinity-slope

# 8G (swap disabled)
AGENTS_8G=120000 WAVE_8G=2500 npm run benchmark:infinity-8g
npm run benchmark:infinity-8g:finalize
npm run benchmark:clawql-8g

# Harness (unique content + full GC + history integrity)
CLAWQL_HARNESS_NS=10000,25000,50000 CLAWQL_HARNESS_REPS=2 \
CLAWQL_HARNESS_INFINITY_CSV=docs/benchmarks/program-density/infinity-on-pi/infinity-slope-reps.csv \
  npm run benchmark:infinity-harness-v2

# Offloaded page-cache + warm/cold wake (trade-off arm)
CLAWQL_OFFLOAD_AGENTS=500 CLAWQL_OFFLOAD_WAKE_SAMPLE=200 CLAWQL_OFFLOAD_WAKE_REPS=3 \
  npm run benchmark:offloaded-tradeoff

# Fit quality: turn latency at baseline vs lastFit under 8G
CLAWQL_FIT_LASTFIT=100000 npm run benchmark:clawql-fit-latency
AGENTS_FIT=77500 PROBE_AT=2500,77500 npm run benchmark:infinity-fit-latency
```

## Later — Raspberry Pi 5

Extra column, same v2 contract + swap-disabled 8 G-native fit. Do not rewrite these VM numbers as Pi.
