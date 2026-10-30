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

## Resident comparison (open host, forced full GC)

| System          | Slope floor (KiB/agent) | History   | Overhead (slope − history) |
| --------------- | ----------------------- | --------- | -------------------------- |
| Infinity        | **102.891**             | ~63.9 KiB | **~39 KiB**                |
| ClawQL resident | **100.221**             | ~63.1 KiB | **~37 KiB**                |

Roughly equal. Samples use `--expose-gc` + multi-pass `gc()` before each RSS read. Schedule for ClawQL: 10k / 25k / 50k (2 fresh-process reps). Infinity: 0…20k step 2k (2 reps).

Evidence: [`evidence-harness-v2.json`](./evidence-harness-v2.json) · `integrityOk: true`

## 8 GB memory limit (not a Pi)

Process born inside cgroup; **`memory.swap.max=0`** (host swap was already 0; peak still 0).

| System          | Last sample before OOM | Ramp slope | Implied RSS/N | Fit-cap (ramp)    | Harness×lastFit     |
| --------------- | ---------------------- | ---------- | ------------- | ----------------- | ------------------- |
| Infinity        | **77 500**             | **102.9**  | ~105 KiB      | **ok** (7.61 GiB) | **ok** (7.61 GiB)   |
| ClawQL resident | **102 500**            | **75.9**   | **~78.9 KiB** | **ok** (7.42 GiB) | **fail** (9.80 GiB) |

ClawQL’s uncapped harness slope (~100 KiB) **overstates** cost under the 8 G ceiling (live RSS/N ≈ 79 KiB; last-step marginal ≈ 74 KiB). Quote **8G fit with ramp slope / RSS/N**, not harness floor × lastFit. Infinity’s public **75k @ 8 GB** line remains close to measured **77.5k** here.

Evidence: [`infinity-8g-ramp.json`](./infinity-8g-ramp.json) · [`clawql-resident-8g-ramp.json`](./clawql-resident-8g-ramp.json)

## Offloaded trade-off (separate row — not a same-terms win)

ClawQL offloaded keeps history on disk (~65.9 KiB/agent bag) with ~**1 KiB** process RSS slope (ids-only). That is a **different product shape**, not a denser Infinity. Measured on this KVM host (`publishable: false`, 500 parked agents, 200 wake sample × 3 order reps):

| Cost / property      | ClawQL offloaded (measured)                         | Closest Infinity analogue                            |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Resident RSS / agent | ~1 KiB (ids-only slope)                             | In-memory idle ~103 KiB (their `agent_scale`)        |
| Durable history      | **~65.9 KiB** disk / agent (`dens_*.json`)          | Serverless / external store path (not measured here) |
| Page cache           | **~68 KiB/agent** (mincore after park)              | N/A for pure in-memory bench                         |
| Warm wake            | **p50 ≈ 0.10 ms**, p99 ≈ 0.27 ms (read+parse+restore) | Warm store hit / in-process reload                 |
| Cold wake            | **p50 ≈ 0.20 ms**, p99 ≈ 0.96 ms (after `DONTNEED`) | Cold start / store fetch (their serverless story)    |

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
```

## Later — Raspberry Pi 5

Extra column, same v2 contract + swap-disabled 8 G-native fit. Do not rewrite these VM numbers as Pi.
