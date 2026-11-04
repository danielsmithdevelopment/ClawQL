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
| Evidence | Authentic JSON was written then **overwritten** by the TTL=10s remasure. Reconstruct from board stdout until remasure lands at [`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json). The file committed earlier as “ttl3s-failed” was a **contaminated partial TTL=10s** write (`status=partial`, `celldTtlMs=10000`, 0 correctness failures) — do not treat it as the failure. |

## Diagnostic only (not a correctness pass)

| Field | Value |
| ----- | ----- |
| Same lab binary | TTL=**10000** wedged N=100 |
| Correctness | 0 failures |
| Evidence | [`phased-n100-wedge-lab-enriched.json`](./phased-n100-wedge-lab-enriched.json) |
| Role | **Diagnostic** — longer TTL hid lost-intent; does **not** clear the TTL=3s failure |

## Regression signal vs stock tip

Prior stock **0.6.3** wedged N=100 at TTL=3000 on an earlier host pass: **0/100** lost ([`phased-n100-wedge-upstream-0.6.3.json`](./phased-n100-wedge-upstream-0.6.3.json), measured 2026-10-31). Lab enriched at the **same TTL on this host** lost **2**. Separate:

1. **Stock control on this same host** — wedged N=100 · TTL=3000 · stock 0.6.3. Pass ⇒ lab patches implicated. Fail ⇒ stock bug this host’s timing exposes (upstream note).
2. **Supersede lines on the two failing trials** — if same-host supersede fired on a wedged (still-alive) owner, that is the bug; check `dead_reason`.
3. **Lease-sweep / eager dead-leader recovery** — `lease_may_be_fenced_as_dead` treats **published expiry alone** as dead (stock tip rule). A wedged owner whose renewals go ambiguous under short TTL can expire while still alive with an intent in flight; `sweep_dead_leaders` then recovers the open log. That path does **not** emit the dual-sided `same-host supersede` line (that log is only for pre-TTL host_process proof). Look for `eager recovery: dead session with an open log` around the failing trials.

### Code note (hypothesis, not yet trial-tied)

Lab `host_process::lease_may_be_fenced_as_dead` (`vendor/celld-lab/crates/celld/host_process.rs`):

- `expires_ms <= now` → **dead** (even if the process is still alive / wedged)
- else same-host `host_process` provably gone → dead
- else not dead

`NodeLogManager::sweep_dead_leaders` uses that predicate and, when dead + open log, runs `recover` (`eager recovery: dead session with an open log`). Dual-sided `same-host supersede: … dead_reason=…` only logs when fencing a **still-unexpired** lease via host_process proof. First TTL=3s board audit saw **0** supersede lines — consistent with post-TTL sweep/recovery rather than pre-TTL same-host supersede, **or** with truncated logs (`startNode` default-truncated celld logs each restart; harness now supports `FLEET_PHASED_APPEND_LOGS=1` for forensics).

## Until root-caused

- **v4 N=1000 stays blocked**
- Step-3 wedge board headline = **TTL 3s fail** (10s pass beside it as diagnostic only)
- Mechanism claim stays **paused**
- Do not raise TTL to green-wash the board
