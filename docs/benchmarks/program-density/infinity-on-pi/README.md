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

## Gate 0 — reproduce Infinity ~100 KB/agent (done)

| Field      | Value                                                      |
| ---------- | ---------------------------------------------------------- |
| Commit     | `341f6c2`                                                  |
| Command    | `AGENTS=10000 TURNS=20 WAVE=500 … --example agent_scale`   |
| RSS/N @10k | **~103.1 KiB/agent** (matches published ~100 KB)           |
| Evidence   | [`evidence-agent-scale.json`](./evidence-agent-scale.json) |

## Four fixes (harness v2)

### 1. Byte parity (done)

Same 20-turn Infinity `agent_scale` message shape (user → asst → tool_call → tool_result → asst × 20 = **100 messages**).

| System                        | Serialized history / agent                                      |
| ----------------------------- | --------------------------------------------------------------- |
| Infinity `serde_json` msgs    | **62 371 B**                                                    |
| ClawQL matched-shape JSON     | **61 761 B**                                                    |
| fair-v2 parked bag (contrast) | **~32 859 B** — **different workload**, not “Infinity overhead” |

Fixtures: [`fixtures/`](./fixtures/). The earlier fair-v2 ~32 KiB disk figure was **not** the same history as Infinity.

### 2. Turns through the runtime (done)

ClawQL uses `DensityConversationRuntime`: every turn appends through the store API (scripted Infinity-matched path). **Not** prebuilt fair-v2 bags.

Honesty: this is a **history-cost harness**, not the full ClawQL durable program / MCP agent stack.

### 3. Slope across N (done; 3-rep floor)

Linear fit of process RSS vs N (not RSS/N at a single N). Infinity CSV from `agent_scale` waves; ClawQL each rep = **fresh Node process**.

| System           | 3-rep floor slope (KiB / agent) | Schedule                     |
| ---------------- | ------------------------------- | ---------------------------- |
| Infinity         | **99.133**                      | 0…20k step 2k (2 slope reps) |
| ClawQL resident  | **52.058**                      | 1k, 5k, 10k × 3 fresh procs  |
| ClawQL offloaded | **0.232**                       | same; history on disk        |

Evidence: [`evidence-harness-v2.json`](./evidence-harness-v2.json) · Infinity CSV [`infinity-slope-reps.csv`](./infinity-slope-reps.csv)

### 4. Resident + offloaded arms (done)

- **Resident** = direct compare to Infinity (history in RAM).
- **Offloaded** = trade-off column (ids-only resident; ~matched disk bytes).

## 8 GB memory limit (simulated Pi RAM claim; not a Pi)

cgroup v2 `memory.max=8G` on this host (`…/cursor-agent/bench8g`). Process **born inside** the cgroup (charges do not migrate if moved after alloc). Label: **“8 GB memory limit on cloud-agent-kvm-vm”** — not “on a Raspberry Pi.”

| System                  | Last sampled N before OOM | Slope in ramp              | Notes                                            |
| ----------------------- | ------------------------- | -------------------------- | ------------------------------------------------ |
| Infinity `agent_scale`  | **80 000** (WAVE=2500)    | **99.1 KiB/agent**         | exit 137; peak=8 GiB; ~84.5k extrapolated @8 GiB |
| ClawQL resident harness | **197 500**               | **~39.8 KiB/agent** (ramp) | Node `--max-old-space-size=8192`; exit 137       |

Evidence: [`infinity-8g-ramp.json`](./infinity-8g-ramp.json) · [`clawql-resident-8g-ramp.json`](./clawql-resident-8g-ramp.json)

Infinity’s public **75k @ 8 GB** line is below the measured last wave on this VM (80k) under a hard 8 G cap — still **not** a Pi result (CPU/storage differ).

## Commands

```bash
# Infinity slope CSV (uncapped)
AGENTS=20000 WAVE=2000 REP=1 npm run benchmark:infinity-slope

# Infinity under 8G cgroup
AGENTS_8G=120000 WAVE_8G=2500 npm run benchmark:infinity-8g

# ClawQL under 8G cgroup (needs birth-inside helper script)
npm run benchmark:clawql-8g

# Harness v2 (byte parity + ClawQL slopes; merge Infinity CSV)
CLAWQL_HARNESS_REPS=3 \
CLAWQL_HARNESS_INFINITY_CSV=docs/benchmarks/program-density/infinity-on-pi/infinity-slope-reps.csv \
  npm run benchmark:infinity-harness-v2
```

## Later — Raspberry Pi 5

Add Pi as an **extra column** (same contract): `agent_scale` slope, 8 GB-native fit, wake/throughput. Do not rewrite these VM harness numbers as Pi.

## Superseded

[`evidence-same-host-density.json`](./evidence-same-host-density.json) — early fair-v2 park write + RSS/N; kept for history. Use harness v2.
