# Infinity × ClawQL density harness (Pi deferred)

Time-sensitive follow-up while Infinity’s public density post is discussed. **Independent of** `durability-pilot-v1`.

Infinity: [hydro-project/infinity](https://github.com/hydro-project/infinity) · [AWS blog](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/)

**Framing:** same-host cloud lab, host disclosed (same standard as our other cloud boards). Live marketing board: [clawql.com/benchmarks#program-density](https://clawql.com/benchmarks/#program-density). Raspberry Pi 5 remains an extra column later — not a rewrite of these numbers. This board is ready to send to Infinity / Shadaj Laddad’s team; under ClawQL peer-review policy, their review comes before promoting a “denser than” claim.

| Field            | Value                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Host kind        | KVM guest (Cursor cloud-agent pod)                                                       |
| Hypervisor       | KVM (`Hypervisor detected: KVM`; `lscpu` Hypervisor vendor: KVM)                         |
| vCPUs            | 4 (1 thread/core × 4 cores × 1 socket)                                                   |
| CPU model name   | `Intel(R) Xeon(R) Processor` (from `/proc/cpuinfo`)                                      |
| CPUID            | GenuineIntel family 6, model 207, stepping 2; 2400 MHz; cache 320 MiB                    |
| Likely microarch | **Likely** 5th-gen Xeon / Emerald Rapids (family 6, model 207); guest cannot confirm SKU |
| DMI product name | **unavailable** — `/sys/class/dmi/id` not present on this guest                          |
| Memory           | ~15.6 GiB (`MemTotal` 16 387 280 KiB)                                                    |
| Kernel           | Linux 6.12.94+ x86_64                                                                    |
| Instance type    | unknown (no cloud instance-metadata endpoint on this pod)                                |
| Storage          | ephemeral pod disk (bind-mounted workspace)                                              |
| `publishable`    | **true** (host disclosed; same-host comparison)                                          |
| Contract         | `infinity-agent-scale-matched-v2` (unique-per-agent text)                                |
| Cgroup           | `memory.max=8G`, **`memory.swap.max=0`** (swap peak verified 0)                          |
| Wave step        | **2 500** agents (both lastFit values accurate to within one step)                       |

## Gates

1. **Byte parity** — matching Infinity-shaped 20-turn / 100-message histories (~65 KiB JSON each side). fair-v2’s ~33 KiB was a different workload.
2. **Unique content** — every agent/turn/slot tagged so V8 cannot share strings across agents.
3. **History integrity** — resident slope (and offloaded disk KiB) ≥ serialized history KiB.
4. **Fit-cap integrity** — `lastFitAgents × rampSlope ≤ memory.max` (catches overstated slopes / swap).
5. **Harness×lastFit cross-check** — uncapped harness floor × 8G lastFit must also fit, or those two numbers must not be quoted together.
6. **Fit quality** — headline N is the highest population where per-turn latency p50 **and** p99 stay within **2×** of the low-N baseline (same rule both systems).

## Headline: history-memory fit under 8 GiB (latency-gated)

**Claim scope (say this plainly):** with **matched 20-turn histories** under the same 8 GiB cap (swap disabled), ClawQL’s **resident history store** fits about **29% more agents** than Infinity’s in-memory `agent_scale` histories. This is a **memory / history-storage** result — **not** “the full ClawQL runtime runs 29% more agents.” Infinity’s arm exercises its full scripted runtime round-trip; ClawQL’s arm is the matched-shape history harness (`DensityConversationRuntime`), not the durable/MCP production stack. A fuller ClawQL arm is welcome if Infinity’s team wants that comparison.

**Lead with measured fit under the cap, not open-host slope × cap.** Extrapolating ClawQL’s open-host ~100 KiB slope undercounts fit by ~25%; Infinity’s open-host slope predicts its 8 G fit well. Under the cap ClawQL collects/compacts harder (~79 KiB/agent); Infinity barely changes (~105 KiB).

Same verification rule both sides: **latency-gated lastFit** = highest N where turn latency stayed within 2× of baseline N=2 500.

| System                        | Latency-gated lastFit | RSS/N at that N | vs Infinity history fit                |
| ----------------------------- | --------------------- | --------------- | -------------------------------------- |
| Infinity `agent_scale`        | **77 500**            | **~105.3 KiB**  | —                                      |
| ClawQL matched-shape resident | **100 000**           | **~78.8 KiB**   | **~29% more histories** (100k / 77.5k) |

Ramp step = 2 500, so both counts are accurate to within one wave. ClawQL’s RSS ramp recorded a further sample at **102 500** before the next wave OOM’d; that point is **not** in the headline because latency was not verified there (probing at the edge risked a V8 heap abort — a sign that 102.5k is not a stable operating point). Infinity’s latency check is at its actual ramp lastFit (77.5k).

Paired per-agent figure = **RSS at latency-gated lastFit / N**. Cgroup `memory.peak` often saturates at `memory.max` during GC spikes — prefer RSS/N; peak/N is an upper bound.

Evidence: [`evidence-clawql-fit-latency.json`](./evidence-clawql-fit-latency.json) · [`evidence-infinity-fit-latency.json`](./evidence-infinity-fit-latency.json) · ramp detail [`infinity-8g-ramp.json`](./infinity-8g-ramp.json) · [`clawql-resident-8g-ramp.json`](./clawql-resident-8g-ramp.json)

## Fit quality — turn latency (baseline → lastFit ratio)

The 2× gate compares each system **only to itself** (lastFit ÷ baseline at N=2 500). Quote these ratios — not absolute ms — when discussing fit quality.

| System   | Baseline N | lastFit N   | p50 ratio (lastFit÷baseline) | p99 ratio | Within 2×? |
| -------- | ---------- | ----------- | ---------------------------- | --------- | ---------- |
| Infinity | 2 500      | **77 500**  | **1.10×**                    | **1.04×** | **yes**    |
| ClawQL   | 2 500      | **100 000** | **0.93×**                    | **1.69×** | **yes**    |

Sample = 100 agents × 1 extra turn each after the population is already resident.

**Do not compare absolute turn times across systems.** Infinity’s probe exercises the full `agent_scale` runtime round-trip (queue → scripted completion → tool → follow-up). ClawQL’s probe times matched-shape `driveTurn` appends in the history harness. Different work; a side-by-side ms reading would invent a ~100× “speed” claim this board does not make.

<details>
<summary>Raw probe samples (ms) — within-system only; not cross-comparable</summary>

| System   | Baseline p50 / p99 (ms) | lastFit p50 / p99 (ms) |
| -------- | ----------------------- | ---------------------- |
| Infinity | 2.776 / 3.894           | 3.059 / 4.046          |
| ClawQL   | 0.025 / 0.051           | 0.023 / 0.086          |

</details>

## Forced memory reclaim (both sides)

Both ramps call an explicit reclaim between waves. A normal deployment may not. State it up front:

| System   | Forced reclaim between waves                                   | Also                                                                            |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ClawQL   | `--expose-gc` + multi-pass `gc()` before RSS / after each wave | `--max-old-space-size=8192` (required so V8 old-space can use the 8 GiB cgroup) |
| Infinity | `malloc_trim(0)` after each wave (stock `agent_scale`)         | glibc malloc; no jemalloc/mimalloc / `MALLOC_*` env                             |

**Primary result includes forced reclaim on both sides** (symmetric). Without it, either system may fit fewer agents in real use. A no-reclaim arm is future work, not this headline.

**Question for Infinity / Shadaj Laddad’s team:** under an 8 GiB hard cap, should a fair density operator set an allocator or heap analog to ClawQL’s required `--max-old-space-size=8192` (jemalloc/mimalloc arenas, glibc `M_TRIM_THRESHOLD` / `MALLOC_ARENA_MAX`, etc.)? If yes, which knobs and defaults belong beside the 75k@8 GB line?

## Resident comparison (open host, forced full GC)

| System          | Slope floor (KiB/agent) | History   | Overhead (slope − history) |
| --------------- | ----------------------- | --------- | -------------------------- |
| Infinity        | **102.891**             | ~63.9 KiB | **~39 KiB**                |
| ClawQL resident | **100.221**             | ~63.1 KiB | **~37 KiB**                |

Roughly equal on an open host — and that equality **mis-predicts** 8 G fit for ClawQL (see headline). Same forced-reclaim protocol as above.

Evidence: [`evidence-harness-v2.json`](./evidence-harness-v2.json) · `integrityOk: true`

## 8 GB ramp detail

Process born inside cgroup; **`memory.swap.max=0`** (swap peak verified 0). Wave step 2 500.

| System          | Last RSS sample before OOM | Latency-gated N (headline) | Ramp slope | RSS/N at latency-gated N | Fit-cap (ramp)    | Harness×lastFit     |
| --------------- | -------------------------- | -------------------------- | ---------- | ------------------------ | ----------------- | ------------------- |
| Infinity        | **77 500**                 | **77 500**                 | **102.9**  | **~105.3 KiB**           | **ok** (7.61 GiB) | **ok** (7.61 GiB)   |
| ClawQL resident | **102 500**                | **100 000**                | **75.9**   | **~78.8 KiB**            | **ok** (7.42 GiB) | **fail** (9.80 GiB) |

Do not jointly quote ClawQL harness floor (~100 KiB) × 102.5k (cross-check fails). Infinity’s public **75k @ 8 GB** line remains close to measured **77.5k** here.

## Offloaded trade-off (separate row — not a same-terms win)

ClawQL offloaded keeps history on disk (~65.9 KiB/agent bag) with ~**1 KiB** process RSS slope (ids-only). That is a **different product shape**, not a denser Infinity. Measured on this host (500 parked agents, 200 wake sample × 3 order reps):

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

Extra column, same v2 contract + swap-disabled 8 G-native fit + same latency gate and reclaim disclosure. Do not rewrite these cloud numbers as Pi.
