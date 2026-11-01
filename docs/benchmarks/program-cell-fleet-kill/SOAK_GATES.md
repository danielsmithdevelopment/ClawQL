# Pre-v4 fleet soak gates

Frozen **before** the next soak. v4 N=1000 starts only when a soak reports `status=measured_v4_ready` (`ok=true`).

## Why node-ceiling-alone is not enough

| Mode | Node records | Failure mode |
| ---- | ------------ | ------------ |
| **Fresh id every restart** (v3) | Grows without bound (712 on N=1000) | Dead registrations accumulate → fleet degrades |
| **Stable id only** (multi-hour soak) | Bounded (2) | Restart collides with prior lease → wait TTL / self-fence / ready flakes |
| **Stable id + incarnation** (product) | Bounded | New incarnation supersedes a *same-host, provably dead* prior; live / cross-host duplicate still refused or waits TTL |

Stable ids diagnosed and stopped the v3 spiral. They do **not** clear the rates that decide availability under the board’s **2%** ceiling.

## Sample size (required cycle count)

Observed rate ≤ 0.5% is not enough: with **n=240** and **zero** failures, the rule-of-three 95% upper bound is **3/240 ≈ 1.25%**, which does **not** demonstrate a 0.5% target.

| Intent | Cycles | Notes |
| ------ | ------ | ----- |
| Bound ≤0.5% with **0** events (rule of three: 3/n ≤ 0.005) | **≥ 600** | Absolute floor to *show* 0.5% under rule-of-three |
| Bound ≤0.5% with **0** events (Wilson 95%) | **≥ ~765** | Wilson zero-event UB = z²/(n+z²); slightly stricter than 3/n |
| Allow **1–2** failures while still bounding ≤0.5% at 95% | **≈ 1000** | Overnight at ~35–60s/cycle — **authorizing soak size** |
| Smoke / harness debug | any | Must **not** claim `measured_v4_ready` below min cycles |

**Harness default for a v4-authorizing soak:** `FLEET_SOAK_MIN_CYCLES=1000` (covers Wilson zero-event and a failure or two). Absolute statistical floor remains 600 (rule-of-three); do not treat a 240-cycle run as rate proof.

Every soak evidence object reports **observed rate**, **Wilson 95% upper bound**, and (when k=0) **rule-of-three 3/n**. Pass requires observed ≤ ceiling, **Wilson UB ≤ ceiling**, and `cyclesCompleted ≥ FLEET_SOAK_MIN_CYCLES`.

## Pass thresholds (defaults in `run-node-soak.mjs`)

Headroom under the board availability ceiling (2% of trials):

| Gate | Default | Env |
| ---- | ------- | --- |
| Unique R2 `nodes/*` | ≤ **2** | `FLEET_SOAK_NODE_CEILING` |
| `readyFails / cycles` (observed **and** Wilson 95% UB) | ≤ **0.5%** (0.005) | `FLEET_SOAK_READY_RATE_CEILING` |
| `selfFences / cycles` (observed **and** Wilson 95% UB) | ≤ **0.5%** (0.005) | `FLEET_SOAK_FENCE_RATE_CEILING` |
| Cycles completed | ≥ **1000** (floor 600 for rule-of-three) | `FLEET_SOAK_MIN_CYCLES` |

All must pass. Exit non-zero otherwise. Status `measured_v4_ready` only when `v4SoakOk=true`.

## “Provably dead” (same-host supersede only)

Incarnation supersede is **not** “TTL expired” and **not** “identity matches.” It is safe only when the old process **cannot still be running**.

**Same host — may supersede** when the lease records and the local OS agree that this exact process is gone:

| Lease field | Check |
| ----------- | ----- |
| `pid` | No process with that PID |
| `processStartTime` (or equivalent start identity) | If PID was reused, start time must not match the recorded one |
| `bootId` (host boot identifier) | Must match the current host boot; a reboot invalidates PID-based proof |

Supersede only when **all** of those say the recorded process is gone. Otherwise wait out the lease TTL (or refuse).

**Cross-host — do not supersede on “looks dead.”** A duplicate `CELLD_NODE` on a **different** machine cannot prove the other host’s process is gone. Policy: **wait out the lease timeout** or **refuse** the duplicate. That keeps same-host fence recovery from reopening the **stale-owner** hole the tip already closed (N=40 stale-owner probe).

## Multi-hour soak vs these gates (2026-10-31)

Evidence: [`node-soak-evidence.json`](./node-soak-evidence.json) · **240** cycles · ~3.75 h · stock 0.6.3 · stable `fleet_A`/`fleet_B`.

| Gate | Measured | 95% UB (Wilson) | Verdict |
| ---- | -------- | --------------- | ------- |
| Unique nodes | **2** / 2 | — | PASS (v3 mode closed) |
| readyFail rate | **6/240 ≈ 2.5%** | **≈5.3%** Wilson | **FAIL** (exceeds board 2% alone; n≪600) |
| selfFence rate | **14/240 ≈ 5.8%** | **≈9.6%** Wilson | **FAIL** |
| Min cycles (≥1000) | 240 | — | **FAIL** |
| `v4SoakOk` | — | — | **false** — do **not** start v4 |

## Order before v4

1. **Incarnation + same-host supersede** (narrow “provably dead” above; cross-host wait/refuse)
2. **Lease-sweep / dead-node GC** (bound stuck maintain)
3. **Alive ≠ ready** (liveness always answers; readiness may 503)
4. **Overnight soak** against these frozen gates (`cycles ≥ 1000`; rates + Wilson UBs ≤ 0.5%; nodes ≤ 2)
5. **Only then** v4 N=1000 under unchanged frozen board criteria

Until a soak meets the gates on the runtime under test, leave the mechanism claim unrestored and keep v4 unstarted.
