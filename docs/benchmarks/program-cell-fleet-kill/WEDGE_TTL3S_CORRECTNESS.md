# Wedged N=100 — TTL 3s correctness failure (mechanism unexplained)

**Status:** Original **2 × `lost_midflight_intent`** remains **mechanism unexplained**. N=300 on the fixed build shows the loss is **rare** (~1% rule-of-three UB), not that its cause is gone. Expiry≠dead was a real fix and is **not** the proven cause of the 2/100 (e2e).

## Frozen rule (do not loosen)

Correctness must be **0** under every condition you test. TTL may only affect **availability**. Lost mid-flight intents are correctness failures **whatever the TTL**. Moving the board to the TTL that passes is loosening.

## Headline (lab enriched — publish as unexplained)

| Field | Value |
| ----- | ----- |
| Binary | lab enriched `lab_enriched_10c9eae89` |
| Board | wedged N=100 · `correctness_availability_v2` · fenceMode `lab_enriched_wedged` |
| `CELLD_TTL_MS` | **3000** |
| Correctness | **FAIL** — **2** × `lost_midflight_intent` (`i=1`, `i=5`, `after_intent_before_call`) |
| Availability | **5**/100 (rate 0.05) — pass at ceiling |
| Regime | Resume tail up to **~62s**; truncated logs with **`outcome="ambiguous"`** renewals |
| Evidence | [`phased-n100-wedge-lab-enriched-ttl3s-failed.json`](./phased-n100-wedge-lab-enriched-ttl3s-failed.json) |
| Mechanism | **unexplained** — do not mark resolved |

## What later boards showed (not root cause)

| Arm | Result | Role |
| --- | ------ | ---- |
| TTL=10s N=100 | 0 lost | Diagnostic — longer TTL can hide loss |
| Quiet TTL=3s remasure | 0 lost; resume p99≈6.9s; **7** ambiguous renews | Intermittency — **does not** clear 2/100 |
| Stock same-host TTL=3s | 0 lost under quiet R2 | Not pressure-matched to the failing regime |
| SIGSTOP e2e pre/post expiry≠dead | Pre: eager recovery while `T`, intent **kept**; post: skip abandon | Expiry-as-dead **ruled out** as sufficient cause |
| Frozen **N=300** TTL=3s fixed build | **0**/300 lost; avail ≈1.3%; resume p99≈7.9s | Rate bound only — **did not** re-enter the 5-avail / ~62s resume regime |

## Pre-latency checks ([`TTL3S_THREE_CHECKS.md`](./TTL3S_THREE_CHECKS.md))

| Check | Result |
| ----- | ------ |
| R2 settle i=1,5 | **Real loss** (i=1): meta present, midflight `paused_for_kill` absent; ok i=9 has it |
| Host / pause | Cloud Agent VM; no board BOOTTIME telemetry; mono-vs-wall pause **candidate**; **do not void** |
| Classifier | Timeout was mislabeled lost — **fixed** (`midflight_storage_unknown`); does not erase §1 |

Lease-belief Ambiguous/receipt paths remain ruled out ([`AMBIGUOUS_RENEWAL.md`](./AMBIGUOUS_RENEWAL.md)). Open product candidate: **CLOCK_BOOTTIME** lease deadlines (`WeakHolderClockPaused` TLA tooth).

Chase remaining:

1. Pause-aware lease clock (BOOTTIME) — concrete candidate from host class + mono `last_ok`
2. **Force arm A** — Ambiguous/timeout renew response
3. **Force arm B** — late Applied renew response

## Expiry ≠ dead (landed; separate)

Still correct and shipped: expiry permits **fenced** takeover; open-log abandon needs process evidence. See [`EXPIRY_NOT_DEAD.md`](./EXPIRY_NOT_DEAD.md). E2e proved the sweep differential; it did **not** reproduce program intent loss.

## Next

1. **Authorizing 1000-cycle soak on Mac mini** with the fixed build → `measured_v4_ready` ([`MAC_MINI_AGENT.md`](./MAC_MINI_AGENT.md)). Settles the post-fix soak self-fence question (void only if the monitor voids). Unblocked by the renew code check (no optimistic-bump fix required first).
2. **v4 N=1000** there with append logs + R2 intent check — report **mechanism unexplained** alongside the result (do not claim the 2/100 closed).
3. Forced renew-latency board in parallel — **both** Ambiguous/timeout and late-Applied arms (after pause-clock decision).
