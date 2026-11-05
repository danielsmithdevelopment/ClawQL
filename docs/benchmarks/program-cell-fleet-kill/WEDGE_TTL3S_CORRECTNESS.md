# Wedged N=100 — TTL 3s correctness failure blocks v4

**Status:** **v4 on hold.** Mechanism claim paused. Headline board result is TTL=3000 correctness fail — not the TTL=10000 remasure pass.

## Frozen rule (do not loosen)

Correctness must be **0** under every condition you test. TTL may only affect **availability** (more timeouts / takeovers under short TTL). Lost writes / lost mid-flight intents are correctness failures **whatever the TTL**.

Moving the board to the TTL that passes is exactly the loosening we said we would not do. A 10s pass shows a longer TTL can **hide** the bug; it does not show the bug is gone.

## Headline (lab enriched, this host)

| Field | Value |
| ----- | ----- |
| Binary | lab enriched `lab_enriched_10c9eae89` (alive≠ready + lease-sweep + same-host supersede + dual-sided supersede logs) |
| Board | wedged N=100 · `correctness_availability_v2` · fenceMode `lab_enriched_wedged` |
| `CELLD_TTL_MS` | **3000** |
| Correctness | **FAIL** — **2** × `lost_midflight_intent` |
| Fail items | `i=1` and `i=5`, both `phase=after_intent_before_call` |
| Availability | 5/100 (rate 0.05, ceiling 0.05) — **pass** (not the gate that failed) |
| Measured | 2026-11-03 ~6:16–6:58 PM PT (`trialsCompleted=100`, `ok=false`) |
| Evidence | [`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) — gate summary reconstructed from board stdout (authentic JSON was overwritten by the TTL=10s remasure; an earlier commit also mislabeled a partial TTL=10s write). |

## Diagnostic only (not a correctness pass)

| Arm | TTL | Correctness | Evidence | Role |
| --- | --- | ----------- | -------- | ---- |
| Lab enriched wedged N=100 | **10000** | 0 | [`phased-n100-wedge-lab-enriched.json`](./phased-n100-wedge-lab-enriched.json) | Longer TTL hid lost-intent |
| Lab enriched wedged N=100 remasure | **3000** | 0 | [`phased-n100-wedge-lab-enriched-ttl3s-remeasure-pass.json`](./phased-n100-wedge-lab-enriched-ttl3s-remeasure-pass.json) | Quieter R2 (resume p99≈6.9s; **7** ambiguous renews; **0** supersede / eager-recovery lines). Shows intermittency — **does not** clear the original 2-loss result |

A pass on remasure under lighter lease pressure is not root cause and not a green light for v4.

## Regression signal vs stock tip

Prior stock **0.6.3** wedged N=100 at TTL=3000 on an earlier host pass: **0/100** lost ([`phased-n100-wedge-upstream-0.6.3.json`](./phased-n100-wedge-upstream-0.6.3.json), measured 2026-10-31). Lab enriched at the **same TTL on this host** lost **2**. Separation attempted:

| Step | Result |
| ---- | ------ |
| **1. Stock same-host control** | Stock 0.6.3 wedged N=100 @ TTL=3000 on **this host**: **PASS** 0 lost ([`phased-n100-wedge-stock-063-ttl3s-same-host.json`](./phased-n100-wedge-stock-063-ttl3s-same-host.json)). Quiet R2 (resume p99≈6.5s). Lab quiet remasure also passed — **not yet pressure-matched**, so this does **not** yet pin lab patches vs host. |
| **2. Supersede on failing trials** | Original board audit: **0** `same-host supersede` lines (logs truncated by default `startNode` rewrite). Quiet remasure with `FLEET_PHASED_APPEND_LOGS=1`: **0** supersede lines (and 0 lost intents). No `dead_reason` to inspect for a same-host supersede of a wedged-alive owner on a failing trial — **not reproduced**. |
| **3. Lease-sweep / eager recovery** | Code: `lease_may_be_fenced_as_dead` treats published expiry alone as dead; `sweep_dead_leaders` recovers open logs (`eager recovery: dead session with an open log`). Quiet remasure: **0** eager-recovery lines. Original truncated end-of-run logs showed **ambiguous renewals** + peer unreachable — consistent with expiry-while-wedged under R2 pressure, but **not trial-tied** to i=1 / i=5. |

**Do not wait on load reproduction to act.** Treating expiry as death is unsafe by itself. Lead and fix: [`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md).

Quiet remasures (0/100) do **not** clear the 2/100 headline — consistent with ~1% rate; rule-of-three on 100 zeros is still ~3.7% UB. After the fix, rerun TTL=3s wedge at **N=300** (zero losses → ~1% UB); the deterministic SIGSTOP+sweep test is the real proof.

### Code fix (lab)

- `lease_may_be_fenced` — expiry permits **fenced takeover** only.
- `lease_open_log_may_be_recovered_as_dead` — open-log sweep requires process evidence (same-host) or TTL+fencing (cross-host/unstamped). Same-host live past expiry → **not** abandoned.
- TLA: `formal/tla/lease/LeaseSweepExpiry` (weak expiry-as-dead must counterexample).

## Until the fix is measured

- **v4 N=1000:** TTL3s correctness hold cleared by frozen N=300 (**0**/300 lost — [`N300_TTL3S_WEDGE.md`](./N300_TTL3S_WEDGE.md)). Authorizing soak still required. Original 2/100 cause still unidentified (e2e: expiry-as-dead sweeps but does not drop ProgramCell intent).
- Step-3 wedge board headline = **TTL 3s fail** (10s pass beside it as diagnostic only)
- Mechanism claim stays **paused**
- Do not raise TTL to green-wash the board
- Order: real-binary SIGSTOP e2e before/after → 200-cycle soak → frozen **N=300** TTL=3s wedge ([`N300_TTL3S_WEDGE.md`](./N300_TTL3S_WEDGE.md)) → only then v4
