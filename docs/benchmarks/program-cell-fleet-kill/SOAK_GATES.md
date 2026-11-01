# Pre-v4 fleet soak gates

Frozen **before** the next soak. v4 N=1000 starts only when a soak reports `status=measured_v4_ready` (`ok=true`).

## Why node-ceiling-alone is not enough

| Mode | Node records | Failure mode |
| ---- | ------------ | ------------ |
| **Fresh id every restart** (v3) | Grows without bound (712 on N=1000) | Dead registrations accumulate → fleet degrades |
| **Stable id only** (multi-hour soak) | Bounded (2) | Restart collides with prior lease → wait TTL / self-fence / ready flakes |
| **Stable id + incarnation** (product) | Bounded | New incarnation supersedes a *dead* prior on the same host; live duplicate still refused |

Stable ids diagnosed and stopped the v3 spiral. They do **not** clear the rates that decide availability under the board’s **2%** ceiling.

## Pass thresholds (defaults in `run-node-soak.mjs`)

Headroom under the board availability ceiling (2% of trials):

| Gate | Default | Env |
| ---- | ------- | --- |
| Unique R2 `nodes/*` | ≤ **2** | `FLEET_SOAK_NODE_CEILING` |
| `readyFails / cycles` | ≤ **0.5%** (0.005) | `FLEET_SOAK_READY_RATE_CEILING` |
| `selfFences / cycles` | ≤ **0.5%** (0.005) | `FLEET_SOAK_FENCE_RATE_CEILING` |

All three must pass. Exit non-zero otherwise.

## Multi-hour soak vs these gates (2026-10-31)

Evidence: [`node-soak-evidence.json`](./node-soak-evidence.json) · 240 cycles · ~3.75 h · stock 0.6.3 · stable `fleet_A`/`fleet_B`.

| Gate | Measured | Verdict |
| ---- | -------- | ------- |
| Unique nodes | **2** / 2 | PASS (v3 mode closed) |
| readyFail rate | **6/240 ≈ 2.5%** | **FAIL** (already above board 2% alone) |
| selfFence rate | **14/240 ≈ 5.8%** | **FAIL** |
| `v4SoakOk` | — | **false** — do **not** start v4 |

## Product path before the next soak

1. **Stable node identity + incarnation** — same `CELLD_NODE`; each start carries a new incarnation that may supersede its own older lease once the old process is provably dead (same host, process gone); refuse a *live* duplicate.
2. **Lease-sweep / dead-node GC** — bound stuck maintain so dead records do not block the ticker.
3. **Alive ≠ ready** — liveness always answers; readiness may 503; callers wait `/program/health` (or readiness), not hung `/health`.

Until a soak meets the rates above on the runtime under test, leave the mechanism claim unrestored and keep v4 unstarted.
