# Pre-v4 fleet soak gates

Frozen **before** the next **authorizing** soak. v4 N=1000 starts only when a soak reports `status=measured_v4_ready` (`ok=true`) on the **fixed** build (incarnation + same-host supersede + lease-sweep + alive≠ready). A soak only authorizes the binary it measured.

## Why node-ceiling-alone is not enough

| Mode | Node records | Failure mode |
| ---- | ------------ | ------------ |
| **Fresh id every restart** (v3) | Grows without bound (712 on N=1000) | Dead registrations accumulate → fleet degrades |
| **Stable id only** (multi-hour soak) | Bounded (2) | Restart collides with prior lease → wait TTL / self-fence / ready flakes |
| **Stable id + incarnation** (product) | Bounded | New incarnation supersedes a *same-host, provably dead* prior; live / cross-host duplicate still refused or waits TTL |

Stable ids diagnosed and stopped the v3 spiral. They do **not** clear the rates that decide availability under the board’s **2%** ceiling.

## Deliberate choice: keep the Wilson bar strict (0.5%)

**Decision (frozen before the overnight soak):** keep each rate gate’s **Wilson 95% upper bound ≤ 0.5%**. Do **not** relax to ~1% to tolerate stray events.

**Consequence at n=1000:** that bar is effectively **zero events per gate**.

| Events in 1000 cycles | Wilson 95% UB (approx.) | vs 0.5% gate |
| --------------------- | ----------------------- | ------------ |
| **0** | ≈0.38% | PASS |
| **1** | ≈0.56% | **FAIL** |
| **2** | ≈0.72% | FAIL (~1700 cycles needed to pass at k=2) |

Because **readyFails** and **selfFences** are separate gates, a v4-authorizing overnight soak must finish with **no ready failures and no self-fences** across the whole run. One stray event of either kind → longer soak or a product fix — not a loosened ceiling after the fact.

**Why strict (not ~1% UB):** v2 and v3 already failed availability. Prefer soak headroom under the board’s 2% ceiling over tolerating flakes that would burn the overnight run into an ambiguous near-miss. The alternate (UB ≈1% per gate, still combined under 2%) remains defensible but is **not** what we freeze here.

## Sample size (required cycle count)

Observed rate ≤ 0.5% is not enough: with **n=240** and **zero** failures, the rule-of-three 95% upper bound is **3/240 ≈ 1.25%**, which does **not** demonstrate a 0.5% target.

| Intent | Cycles | Notes |
| ------ | ------ | ----- |
| Bound ≤0.5% with **0** events (rule of three: 3/n ≤ 0.005) | **≥ 600** | Absolute floor under rule-of-three |
| Bound ≤0.5% with **0** events (Wilson 95%) | **≥ ~765** | Wilson zero-event UB = z²/(n+z²) |
| Authorizing overnight (strict 0.5% Wilson → effectively 0/0) | **≥ 1000** | Size of the run; still requires **zero** readyFails and **zero** selfFences |
| Smoke / harness debug | any | Must **not** claim `measured_v4_ready` below min cycles |

**Harness default:** `FLEET_SOAK_MIN_CYCLES=1000`. Do not treat a 240-cycle run as rate proof.

Every soak evidence object reports **observed rate**, **Wilson 95% upper bound**, and (when k=0) **rule-of-three 3/n**. Pass requires observed ≤ ceiling, **Wilson UB ≤ ceiling**, and `cyclesCompleted ≥ FLEET_SOAK_MIN_CYCLES`.

## Pass thresholds (defaults in `run-node-soak.mjs`)

Headroom under the board availability ceiling (2% of trials):

| Gate | Default | Env |
| ---- | ------- | --- |
| Unique R2 `nodes/*` | ≤ **2** | `FLEET_SOAK_NODE_CEILING` |
| `readyFails / cycles` (observed **and** Wilson 95% UB) | ≤ **0.5%** (0.005) | `FLEET_SOAK_READY_RATE_CEILING` |
| `selfFences / cycles` (observed **and** Wilson 95% UB) | ≤ **0.5%** (0.005) | `FLEET_SOAK_FENCE_RATE_CEILING` |
| Cycles completed | ≥ **1000** | `FLEET_SOAK_MIN_CYCLES` |

**Practical overnight bar:** `readyFails === 0` **and** `selfFences === 0` at n≥1000 (plus nodes≤2). All must pass. Exit non-zero otherwise. Status `measured_v4_ready` only when `v4SoakOk=true`.

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

## Measured soaks (not authorizing)

### Multi-hour stable-id (2026-10-31) — diagnostic

Evidence: [`node-soak-evidence.json`](./node-soak-evidence.json) · **240** cycles · ~3.75 h · stock 0.6.3 · stable ids.

| Gate | Measured | 95% UB (Wilson) | Verdict |
| ---- | -------- | --------------- | ------- |
| Unique nodes | **2** / 2 | — | PASS (v3 mode closed) |
| readyFail rate | **6/240 ≈ 2.5%** | **≈5.3%** | **FAIL** |
| selfFence rate | **14/240 ≈ 5.8%** | **≈9.6%** | **FAIL** |
| Min cycles (≥1000) | 240 | — | **FAIL** |

### Overnight attempt stopped (2026-10-31) — **baseline unfixed**

Evidence: [`node-soak-baseline-unfixed-0.6.3.json`](./node-soak-baseline-unfixed-0.6.3.json) · stock **0.6.3 unfixed** · started overnight at 1000 cycles · **stopped at 60** to free the host for product fixes.

| | |
| --- | --- |
| Role | **`baseline_unfixed_stock_0_6_3`** — not authorizing |
| Cycles | **60**/1000 (~39 min) |
| Unique nodes | **2** |
| readyFails | **2** (~3.3%; Wilson UB ≈11%) — strict gate already dead |
| selfFences | **2** (~3.3%; Wilson UB ≈11%) |
| Why stopped | Soak on unfixed build cannot authorize v4; host needed for incarnation/sweep/alive |

Compare later authorizing soak on the **fixed** build against this baseline.

### Lab supersede smoke (2026-10-31) — not authorizing (n≪1000)

Evidence: [`node-soak-lab-supersede-smoke.json`](./node-soak-lab-supersede-smoke.json) · lab binary (`alive` + sweep + same-host supersede) · **12** cycles · **0** readyFails · **0** selfFences · nodes=2. Logs show `same-host supersede` fencing with thousands of ms of lease still remaining. Wilson UBs at n=12 still ≫0.5% — overnight n≥1000 still required.

## Order before v4

1. **Incarnation + same-host supersede** (narrow “provably dead” above; cross-host wait/refuse) — **landed in** [`vendor/celld-lab/`](../../../vendor/celld-lab/LAB.md)
2. **Lease-sweep / dead-node GC** (bound stuck maintain) — **landed in lab**
3. **Alive ≠ ready** (liveness always answers; readiness may 503) — **landed in lab**
4. **Overnight soak** against these frozen gates on the **lab binary** (`cycles ≥ 1000`; **0** readyFails and **0** selfFences so Wilson UBs ≤ 0.5%; nodes ≤ 2)
5. **Only then** v4 N=1000 under unchanged frozen board criteria

Until a soak meets the gates on the runtime under test, leave the mechanism claim unrestored and keep v4 unstarted.
