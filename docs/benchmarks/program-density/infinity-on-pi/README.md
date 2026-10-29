# Infinity × ClawQL density harness (Pi deferred)

Time-sensitive follow-up while Infinity’s public density post is discussed. **Independent of** `durability-pilot-v1`.

Infinity: [hydro-project/infinity](https://github.com/hydro-project/infinity) · [AWS blog](https://aws.amazon.com/blogs/opensource/introducing-infinity-a-runtime-for-extreme-agent-concurrency/)

**Framing:** same-host harness now; Raspberry Pi 5 as an extra column later. This cloud-agent host is a **KVM VM** → all numbers here are `publishable: false` (harness debugging only). Publish from Pi / bare-metal.

| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Host kind     | `cloud-agent-kvm-vm` (Hypervisor=KVM, Xeon, 4 vCPU, ~15.6 GiB) |
| Instance type | unknown (no cloud metadata endpoint on this pod)               |
| Storage       | ephemeral pod disk                                             |
| `publishable` | **false**                                                      |
| Contract      | `infinity-agent-scale-matched-v2` (unique-per-agent text)      |

## Gate 0 — reproduce Infinity ~100 KB/agent (done)

| Field                                    | Value                                                      |
| ---------------------------------------- | ---------------------------------------------------------- |
| Commit                                   | `341f6c2`                                                  |
| Command                                  | `AGENTS=10000 TURNS=20 WAVE=500 … --example agent_scale`   |
| RSS/N @10k (original identical fixtures) | **~103.1 KiB/agent**                                       |
| Evidence                                 | [`evidence-agent-scale.json`](./evidence-agent-scale.json) |

## Shared-string footgun (fixed in v2)

An earlier ClawQL resident slope of ~52 KiB/agent was **impossible**: serialized history alone is ~63 KiB, and `197.5k × 52 KiB` cannot fit under an 8 GiB cgroup. Cause: scripted fixtures reused the same string values across agents; V8 interned/shared them so RSS did not scale with N.

**v2 fix:** every message text embeds a fixed-width unique tag from `(agentId, turn, slot)` in **both** systems. Automatic guard: resident slope (and offloaded disk KiB) must be **≥ serialized history KiB** or the harness dies.

## Byte parity (v2 unique content)

| System                      | Serialized history / agent     |
| --------------------------- | ------------------------------ |
| Infinity `serde_json` msgs  | **65 471 B** (~63.9 KiB)       |
| ClawQL matched JSON         | **64 601 B** (~63.1 KiB)       |
| fair-v2 bag (contrast only) | ~32 859 B — different workload |

Fixtures: [`fixtures/`](./fixtures/).

## Slope floors (unique content; 3-rep ClawQL = fresh Node)

| System                       | 3-rep floor slope (KiB / agent) | vs history                              |
| ---------------------------- | ------------------------------- | --------------------------------------- |
| Infinity                     | **102.891**                     | ≥ 63.9 KiB ✓ (~39 KiB runtime overhead) |
| ClawQL resident              | **98.654**                      | ≥ 63.1 KiB ✓                            |
| ClawQL offloaded (RSS slope) | **1.24**                        | history on disk (~65.9 KiB/agent disk)  |

Evidence: [`evidence-harness-v2.json`](./evidence-harness-v2.json) · `integrityOk: true`

Infinity’s ~103 KiB RSS/agent vs ~64 KiB raw history ⇒ **~39 KiB/agent runtime overhead** — a fair reading once workloads match and strings are unique.

## 8 GB memory limit (not a Pi)

cgroup v2 `memory.max=8G`; process **born inside** the cgroup. Label: **“8 GB memory limit on cloud-agent-kvm-vm.”**

| System                  | Last sampled N before OOM | Ramp slope                     | Notes                                |
| ----------------------- | ------------------------- | ------------------------------ | ------------------------------------ |
| Infinity `agent_scale`  | **77 500**                | **102.9 KiB/agent**            | exit 137; ~81.4k extrapolated @8 GiB |
| ClawQL resident harness | **102 500**               | **~65.0 KiB/agent** (ramp fit) | exit 137; last RSS/N ≈ 79.5 KiB      |

Evidence: [`infinity-8g-ramp.json`](./infinity-8g-ramp.json) · [`clawql-resident-8g-ramp.json`](./clawql-resident-8g-ramp.json)

Infinity’s public **75k @ 8 GB** line is close to the measured last wave (**77.5k**) under a hard 8 G cap on this VM — still **not** a Pi result (CPU/storage differ).

## Commands

```bash
AGENTS=20000 WAVE=2000 REP=1 npm run benchmark:infinity-slope
AGENTS_8G=120000 WAVE_8G=2500 npm run benchmark:infinity-8g
npm run benchmark:clawql-8g

CLAWQL_HARNESS_REPS=3 \
CLAWQL_HARNESS_INFINITY_CSV=docs/benchmarks/program-density/infinity-on-pi/infinity-slope-reps.csv \
  npm run benchmark:infinity-harness-v2
```

## Later — Raspberry Pi 5

Add Pi as an **extra column** (same v2 contract). Do not rewrite these VM harness numbers as Pi.

## Superseded

- [`evidence-same-host-density.json`](./evidence-same-host-density.json) — fair-v2 park write + RSS/N
- Pre-unique harness slopes (~52 KiB ClawQL resident) — shared-string artifact
